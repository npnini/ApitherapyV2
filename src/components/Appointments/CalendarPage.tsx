import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import heLocale from '@fullcalendar/core/locales/he';
import enGbLocale from '@fullcalendar/core/locales/en-gb';
import type { DateSelectArg, DatesSetArg, DayHeaderContentArg, EventClickArg, EventContentArg, EventDropArg } from '@fullcalendar/core';
import type { DateClickArg, EventResizeDoneArg } from '@fullcalendar/interaction';
import { Appointment } from '../../types/appointments';
import { AppUser } from '../../types/user';
import { T, useT, useTranslationContext } from '../T';
import ConfirmationModal from '../ConfirmationModal';
import StatusLegend from './StatusLegend';
import AppointmentEditor, { PatientOption } from './AppointmentEditor';
import * as appointmentService from '../../services/appointmentService';
import { logAction } from '../../services/auditLogService';
import { getEffectiveAppointmentPrefs } from '../../utils/appointments/prefs';
import {
    addMinutes, earliestWorkingStart, formatDate, formatDayDateTime, formatDayMonth, formatWeekday,
    isOutsideWorkingHours, toBusinessHours, toHHmm,
} from '../../utils/appointments/time';
import { findOverlaps } from '../../utils/appointments/clashes';
import { isChangeable } from '../../utils/appointments/status';
import styles from './Appointments.module.css';

interface CalendarPageProps {
    /** Whose calendar: the signed-in caretaker, or the one being viewed with "View As". */
    caretaker: AppUser;
    /** The signed-in user (activity log). */
    actor: AppUser;
    appConfig: any;
    patients: PatientOption[];
    /** "View As" another caretaker: see only (spec §14). */
    readOnly: boolean;
    /** Opened from a patient's "Open in calendar": show this date's week first. */
    initialDate?: Date | null;
    /** Opened from a patient: "Back to patient" returns to their Appointments tab. */
    onBackToPatient?: () => void;
    backToPatientName?: string;
}

const SLOT_MINUTES = 30;
const SCROLL_LEAD_MINUTES = 120;

// FullCalendar options that are objects/arrays must keep the same identity between renders:
// a new object makes FullCalendar re-apply its options and jump back to the current week.
const PLUGINS = [timeGridPlugin, interactionPlugin];
const LOCALES = [heLocale, enGbLocale];
// No FullCalendar title: the page header shows the week as dd/mm/yyyy – dd/mm/yyyy instead.
const HEADER_TOOLBAR = { start: 'prev,next today', center: '', end: '' };
const TIME_FORMAT = { hour: '2-digit', minute: '2-digit', hour12: false } as const;

type EditorState =
    | { mode: 'create'; start: Date; minutes: number }
    | { mode: 'edit'; appointment: Appointment };

type PendingMove = {
    appointment: Appointment;
    start: Date;
    end: Date;
    overlaps: Appointment[];
    outside: boolean;
    revert: () => void;
};

/**
 * Week calendar of the caretaker's appointments (spec §7): book by click or drag, move or
 * resize by dragging (with confirmation), open an appointment to edit, cancel or correct its
 * status. Cancelled appointments are hidden. Overlapping appointments are shown side by side.
 */
const CalendarPage: React.FC<CalendarPageProps> = ({
    caretaker, actor, appConfig, patients, readOnly, initialDate, onBackToPatient, backToPatientName,
}) => {
    const { language, direction } = useTranslationContext();
    const tLoadFailed = useT('Could not load appointments.');
    const tMoveFailed = useT('Could not move the appointment.');
    const tMissedTag = useT('Missed');
    const tAttendedTag = useT('Attended');

    const prefs = useMemo(() => getEffectiveAppointmentPrefs(caretaker, appConfig), [caretaker, appConfig]);
    const businessHours = useMemo(() => toBusinessHours(prefs.workingWeek), [prefs.workingWeek]);
    // First view scrolls to 2 hours before the caretaker's earliest working start (user request),
    // so an early "now" line is visible above the working hours. Never before 00:00.
    const scrollTime = useMemo(() => {
        const [h, m] = earliestWorkingStart(prefs.workingWeek).split(':').map(Number);
        const minutes = Math.max(0, h * 60 + m - SCROLL_LEAD_MINUTES);
        return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
    }, [prefs.workingWeek]);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [range, setRange] = useState<{ from: Date; to: Date } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editor, setEditor] = useState<EditorState | null>(null);
    const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
    const calendarRef = useRef<FullCalendar>(null);

    const patientName = useCallback((id: string) => patients.find(p => p.id === id)?.fullName || '—', [patients]);

    const load = useCallback(async () => {
        if (!range) return;
        try {
            setAppointments(await appointmentService.listByCaretakerRange(caretaker.uid, range.from, range.to));
            setError(null);
        } catch (err) {
            console.error('Loading appointments failed:', err);
            setError(tLoadFailed);
        }
    }, [range, caretaker.uid, tLoadFailed]);

    useEffect(() => { load(); }, [load]);

    const events = useMemo(() => appointments
        .filter(a => a.status !== 'cancelled')
        .map(a => ({
            id: a.id,
            title: patientName(a.patientId),
            start: a.start,
            end: a.end,
            editable: !readOnly && isChangeable(a),
            classNames: [styles.event, styles[`status_${a.status}`]],
            extendedProps: { appointment: a },
        })), [appointments, patientName, readOnly]);

    const handleDatesSet = (arg: DatesSetArg) => {
        setRange(prev => (prev && prev.from.getTime() === arg.start.getTime() && prev.to.getTime() === arg.end.getTime())
            ? prev : { from: arg.start, to: arg.end });
    };

    // A click (no drag, see selectMinDistance) selects the default meeting length from the top of
    // the clicked 30-minute row (user decision 2026-09-28: a click inside a row always starts at
    // :00/:30, never at the invisible 15-minute snap). Dragging keeps 15-minute precision.
    // Goes through select(), so the highlighted block matches the length in the dialog.
    const handleDateClick = (arg: DateClickArg) => {
        if (readOnly) return;
        const start = new Date(arg.date);
        start.setMinutes(start.getMinutes() - (start.getMinutes() % SLOT_MINUTES), 0, 0);
        calendarRef.current?.getApi().select(start, addMinutes(start, prefs.defaultMeetingMinutes));
    };

    // A drag (or the click above) opens the dialog with the selected range. The selection stays
    // highlighted while the dialog is open and is cleared when it closes.
    const handleSelect = (arg: DateSelectArg) => {
        if (readOnly) return;
        const selected = Math.round((arg.end.getTime() - arg.start.getTime()) / 60_000);
        setEditor({ mode: 'create', start: arg.start, minutes: selected });
    };

    const closeEditor = () => {
        setEditor(null);
        calendarRef.current?.getApi().unselect();
    };

    // Column headers: short weekday + dd/mm, in every language.
    const renderDayHeader = (arg: DayHeaderContentArg) => `${formatWeekday(arg.date, language, 'short')} ${formatDayMonth(arg.date)}`;

    // Week title shown next to the page title: dd/mm/yyyy – dd/mm/yyyy (range end is exclusive).
    const weekTitle = range ? `${formatDate(range.from)} – ${formatDate(addMinutes(range.to, -1))}` : '';

    const handleEventClick = (arg: EventClickArg) => {
        setEditor({ mode: 'edit', appointment: arg.event.extendedProps.appointment as Appointment });
    };

    const askMove = (appointment: Appointment, start: Date | null, end: Date | null, revert: () => void) => {
        if (!start || !end || start <= new Date()) { revert(); return; }
        setPendingMove({
            appointment, start, end, revert,
            overlaps: findOverlaps(start, end, appointments, appointment.id),
            outside: isOutsideWorkingHours(start, end, prefs.workingWeek),
        });
    };

    const handleEventDrop = (arg: EventDropArg) =>
        askMove(arg.event.extendedProps.appointment as Appointment, arg.event.start, arg.event.end, arg.revert);

    const handleEventResize = (arg: EventResizeDoneArg) =>
        askMove(arg.event.extendedProps.appointment as Appointment, arg.event.start, arg.event.end, arg.revert);

    const confirmMove = async () => {
        if (!pendingMove) return;
        const { appointment, start, end, revert } = pendingMove;
        setPendingMove(null);
        try {
            await appointmentService.move(appointment.id, start, end);
            logAction(actor, {
                category: 'patient', action: 'update', entityType: 'appointment',
                entityId: appointment.id, entityName: patientName(appointment.patientId), detail: `moved to ${start.toISOString()}`,
            });
            await load();
        } catch (err) {
            console.error('Moving appointment failed:', err);
            revert();
            setError(tMoveFailed);
        }
    };

    const cancelMove = () => {
        pendingMove?.revert();
        setPendingMove(null);
    };

    // Colour is never the only signal: attended gets ✓, missed gets a struck-through name and a tag.
    // The drag preview ("mirror") has no appointment behind it: show just its time range.
    const renderEventContent = (arg: EventContentArg) => {
        const a = arg.event.extendedProps.appointment as Appointment | undefined;
        if (!a || arg.isMirror) {
            return (
                <div className={styles.eventInner}>
                    <span className={styles.eventTime}>{arg.timeText}</span>
                </div>
            );
        }
        // Start time and name on one line (a 30-minute block has room for one line only); longer
        // blocks let the name wrap. The tooltip carries the full range and name when it is cut off.
        const fullText = `${toHHmm(a.start)}–${toHHmm(a.end)} ${arg.event.title}`;
        return (
            <div className={styles.eventInnerInline} title={fullText}>
                <span className={styles.eventTime}>{arg.timeText}</span>{' '}
                <span className={a.status === 'missed' ? styles.struck : undefined}>
                    {a.status === 'attended' && <span aria-label={tAttendedTag}>✓ </span>}
                    {arg.event.title}
                </span>
                {a.status === 'missed' && <> <span className={styles.missedTag}>{tMissedTag}</span></>}
            </div>
        );
    };

    return (
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <h1 className={styles.pageTitle}>
                    <T>Calendar</T>
                    {weekTitle && <span className={styles.weekTitle} dir="ltr">{weekTitle}</span>}
                </h1>
                {onBackToPatient && (
                    <button type="button" className={styles.btnSecondary} onClick={onBackToPatient}>
                        <span aria-hidden="true">{direction === 'rtl' ? '→ ' : '← '}</span>
                        <T>Back to patient</T>{backToPatientName ? `: ${backToPatientName}` : ''}
                    </button>
                )}
                <StatusLegend />
            </div>

            {readOnly && (
                <p className={styles.infoNote}><T>View only: you are viewing another caretaker's calendar.</T></p>
            )}
            {error && <p className={styles.errorText} role="alert"><span aria-hidden="true">⚠ </span>{error}</p>}

            <div className={styles.calendarCard}>
                <FullCalendar
                    ref={calendarRef}
                    plugins={PLUGINS}
                    initialView="timeGridWeek"
                    initialDate={initialDate ?? undefined}
                    locales={LOCALES}
                    locale={language === 'he' ? 'he' : 'en-gb'}
                    direction={direction}
                    firstDay={0}
                    headerToolbar={HEADER_TOOLBAR}
                    allDaySlot={false}
                    nowIndicator={true}
                    slotDuration={`00:${SLOT_MINUTES}:00`}
                    snapDuration="00:15:00"
                    slotLabelFormat={TIME_FORMAT}
                    eventTimeFormat={TIME_FORMAT}
                    displayEventEnd={false}
                    scrollTime={scrollTime}
                    businessHours={businessHours}
                    slotEventOverlap={false}
                    height="100%"
                    selectable={!readOnly}
                    selectMirror={true}
                    editable={!readOnly}
                    eventDurationEditable={!readOnly}
                    events={events}
                    eventContent={renderEventContent}
                    datesSet={handleDatesSet}
                    selectMinDistance={5}
                    dateClick={handleDateClick}
                    select={handleSelect}
                    dayHeaderContent={renderDayHeader}
                    eventClick={handleEventClick}
                    eventDrop={handleEventDrop}
                    eventResize={handleEventResize}
                />
            </div>

            {editor && (
                <AppointmentEditor
                    mode={editor.mode}
                    appointment={editor.mode === 'edit' ? editor.appointment : undefined}
                    initialStart={editor.mode === 'create' ? editor.start : new Date()}
                    initialMinutes={editor.mode === 'create' ? editor.minutes : prefs.defaultMeetingMinutes}
                    patients={patients}
                    caretakerId={caretaker.uid}
                    workingWeek={prefs.workingWeek}
                    readOnly={readOnly}
                    actor={actor}
                    onClose={closeEditor}
                    onChanged={load}
                />
            )}

            <ConfirmationModal
                isOpen={!!pendingMove}
                title={<T>Move appointment?</T>}
                message={pendingMove ? (
                    <div>
                        <p>
                            {patientName(pendingMove.appointment.patientId)}: {formatDayDateTime(pendingMove.start, language)}–{toHHmm(pendingMove.end)}
                        </p>
                        {pendingMove.overlaps.map(o => (
                            <p key={o.id} className={styles.warningLine}>
                                <span aria-hidden="true">⚠ </span><T>Overlaps with the appointment of</T> {patientName(o.patientId)} ({toHHmm(o.start)}–{toHHmm(o.end)})
                            </p>
                        ))}
                        {pendingMove.outside && (
                            <p className={styles.warningLine}><span aria-hidden="true">⚠ </span><T>Outside your working hours</T></p>
                        )}
                    </div>
                ) : ''}
                confirmLabel={pendingMove && (pendingMove.overlaps.length > 0 || pendingMove.outside) ? <T>Move anyway</T> : <T>Move</T>}
                cancelLabel={<T>Keep as it was</T>}
                onConfirm={confirmMove}
                onCancel={cancelMove}
            />
        </div>
    );
};

export default CalendarPage;
