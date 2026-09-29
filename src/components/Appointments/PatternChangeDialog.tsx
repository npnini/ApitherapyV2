import React, { useState } from 'react';
import { Appointment, WeeklySlot } from '../../types/appointments';
import { AppUser } from '../../types/user';
import { T } from '../T';
import ConfirmationModal from '../ConfirmationModal';
import * as appointmentService from '../../services/appointmentService';
import { logAction } from '../../services/auditLogService';
import { findOverlaps } from '../../utils/appointments/clashes';
import { nextPatternStarts } from '../../utils/appointments/suggestions';
import { addMinutes } from '../../utils/appointments/time';

interface PatternChangeDialogProps {
    /** Future booked appointments that are not on the new pattern. */
    offPattern: Appointment[];
    newSlots: WeeklySlot[];
    caretakerId: string;
    patientName: string;
    actor: AppUser;
    onClose: () => void;
    onMoved: (result: { moved: number; notMoved: number }) => void;
}

const HORIZON_DAYS = 400;

/**
 * After the weekly pattern changes (spec §8): "You have N booked appointments on the old
 * pattern. Move them to the new pattern?" Move re-places them, in order, on the next new-pattern
 * slots that clash with nothing (the caretaker's other appointments or each other). Updated
 * invitations are sent by the server trigger. Past appointments are never touched.
 */
const PatternChangeDialog: React.FC<PatternChangeDialogProps> = ({
    offPattern, newSlots, caretakerId, patientName, actor, onClose, onMoved,
}) => {
    const [working, setWorking] = useState(false);

    const move = async () => {
        setWorking(true);
        let moved = 0;
        try {
            const now = new Date();
            const movingIds = new Set(offPattern.map(a => a.id));
            // Everything that stays where it is: the caretaker's other appointments and this patient's kept ones.
            const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + HORIZON_DAYS);
            const fixed = (await appointmentService.listByCaretakerRange(caretakerId, now, horizon))
                .filter(a => !movingIds.has(a.id));
            const placed: Appointment[] = [];
            let cursor = now;

            for (const a of offPattern) {
                const minutes = Math.round((a.end.getTime() - a.start.getTime()) / 60_000);
                const [target] = nextPatternStarts(newSlots, cursor, 1,
                    start => findOverlaps(start, addMinutes(start, minutes), [...fixed, ...placed]).length > 0);
                if (!target) continue;
                const end = addMinutes(target, minutes);
                await appointmentService.move(a.id, target, end);
                logAction(actor, {
                    category: 'patient', action: 'update', entityType: 'appointment', entityId: a.id,
                    entityName: patientName, detail: `moved to new pattern ${target.toISOString()}`,
                });
                placed.push({ ...a, start: target, end });
                cursor = target;
                moved++;
            }
        } catch (err) {
            console.error('Moving appointments to the new pattern failed:', err);
        } finally {
            setWorking(false);
            onMoved({ moved, notMoved: offPattern.length - moved });
        }
    };

    return (
        <ConfirmationModal
            isOpen={true}
            title={<T>The weekly pattern changed</T>}
            message={
                <p>
                    <T>Booked appointments on the old pattern</T>: {offPattern.length}.{' '}
                    <T>Move them to the new pattern?</T>
                </p>
            }
            confirmLabel={working ? <T>Moving...</T> : <T>Move</T>}
            cancelLabel={<T>Keep as is</T>}
            onConfirm={() => { if (!working) move(); }}
            onCancel={() => { if (!working) onClose(); }}
        />
    );
};

export default PatternChangeDialog;
