import React from 'react';
import { T, useTranslationContext } from '../T';
import { EntityRef, KnowledgeBase, KnowledgeEntityType, LocalizedText, entityName, pickText } from '../../services/knowledgeService';
import { getLanguageName } from '../../utils/languageNames';
import DocumentLinks from './DocumentLinks';
import styles from './Knowledge.module.css';

export const TYPE_LABEL: Record<KnowledgeEntityType, string> = {
    problem: 'Problem',
    protocol: 'Protocol',
    point: 'Point',
    pointGroup: 'Point group',
    measure: 'Measure',
};

interface EntityViewProps {
    kb: KnowledgeBase;
    entity: EntityRef;
    onOpen: (ref: EntityRef) => void;
    /** Language of legacy single-string document links. */
    defaultLang: string;
}

/** Read-only page of one knowledge entity (directions §4): its texts, related entities (as links) and documents. */
const EntityView: React.FC<EntityViewProps> = ({ kb, entity, onOpen, defaultLang }) => {
    const { language } = useTranslationContext();
    const text = (value: string | Record<string, string> | undefined | null) => pickText(value, language);
    const refs = (type: KnowledgeEntityType, ids: string[] | undefined): EntityRef[] => (ids || []).map(id => ({ type, id }));
    const title = entityName(kb, entity, language);

    let fields: React.ReactNode = null;
    let related: React.ReactNode = null;
    let documentUrl: string | Record<string, string> | undefined;

    switch (entity.type) {
        case 'problem': {
            const problem = kb.problems.get(entity.id);
            if (!problem) return <NotAvailable />;
            documentUrl = problem.documentUrl;
            fields = <Field label="Description" value={text(problem.description)} lines />;
            related = <>
                <RelatedList title="Protocols for this problem" items={refs('protocol', kb.protocolsOfProblem.get(problem.id))} kb={kb} onOpen={onOpen} />
                <RelatedList title="Measures used to follow progress" items={refs('measure', (problem.measureIds || []).filter(id => kb.measures.has(id)))} kb={kb} onOpen={onOpen} />
            </>;
            break;
        }
        case 'protocol': {
            const protocol = kb.protocols.get(entity.id);
            if (!protocol) return <NotAvailable />;
            documentUrl = protocol.documentUrl;
            fields = <>
                <Field label="Description" value={text(protocol.description)} lines />
                <Field label="Rationale" value={text(protocol.rationale)} lines />
                <Field label="Directive" value={text(protocol.directive)} lines />
            </>;
            related = <>
                <RelatedList title="Points in this protocol" items={refs('point', kb.pointsOfProtocol.get(protocol.id))} kb={kb} onOpen={onOpen} />
                <RelatedList title="Measures used to follow progress" items={refs('measure', (protocol.measureIds || []).filter(id => kb.measures.has(id)))} kb={kb} onOpen={onOpen} />
                <RelatedList title="Problems this protocol is used for" items={refs('problem', kb.problemsOfProtocol.get(protocol.id))} kb={kb} onOpen={onOpen} />
            </>;
            break;
        }
        case 'point': {
            const point = kb.points.get(entity.id);
            if (!point) return <NotAvailable />;
            documentUrl = point.documentUrl;
            fields = <>
                <Field label="Description" value={text(point.description)} lines />
                <Field label="Details" value={text(point.longText)} lines />
            </>;
            const groupId = point.Point_Grouping && kb.pointGroups.has(point.Point_Grouping) ? point.Point_Grouping : undefined;
            related = <>
                <RelatedList title="Point group" items={groupId ? [{ type: 'pointGroup', id: groupId }] : []} kb={kb} onOpen={onOpen} />
                <RelatedList title="Protocols that use this point" items={refs('protocol', kb.protocolsOfPoint.get(point.id))} kb={kb} onOpen={onOpen} />
            </>;
            break;
        }
        case 'pointGroup': {
            const group = kb.pointGroups.get(entity.id);
            if (!group) return <NotAvailable />;
            fields = <Field label="Description" value={text(group.description)} lines />;
            related = <RelatedList title="Points in this group" items={sortByCode(kb, refs('point', kb.pointsOfGroup.get(group.id)))} kb={kb} onOpen={onOpen} />;
            break;
        }
        case 'measure': {
            const measure = kb.measures.get(entity.id);
            if (!measure) return <NotAvailable />;
            documentUrl = measure.documentUrl;
            fields = <>
                <Field label="Description" value={text(measure.description)} lines />
                <div className={styles.field}>
                    <h3 className={styles.fieldLabel}><T>Scale</T></h3>
                    <p className={styles.fieldText}>
                        <span dir="ltr">{measure.min}–{measure.max}</span>
                        {' · '}
                        <T>{measure.improvementDirection === 'DOWN' ? 'A lower value means improvement' : 'A higher value means improvement'}</T>
                    </p>
                </div>
            </>;
            related = <>
                <RelatedList title="Problems that use this measure" items={refs('problem', kb.problemsOfMeasure.get(measure.id))} kb={kb} onOpen={onOpen} />
                <RelatedList title="Protocols that use this measure" items={refs('protocol', kb.protocolsOfMeasure.get(measure.id))} kb={kb} onOpen={onOpen} />
            </>;
            break;
        }
    }

    return (
        <>
            <section className={styles.card}>
                <span className={styles.typeTag}><T>{TYPE_LABEL[entity.type]}</T></span>
                <h2 className={styles.entityTitle}>
                    <span dir="auto">{title.text}</span>
                    <LangTag lang={title.lang} />
                </h2>
                {fields && <div className={styles.fields}>{fields}</div>}
            </section>
            {related}
            <DocumentLinks documentUrl={documentUrl} defaultLang={defaultLang} />
        </>
    );
};

const sortByCode = (kb: KnowledgeBase, items: EntityRef[]) => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return [...items].sort((a, b) => collator.compare(kb.points.get(a.id)?.code || '', kb.points.get(b.id)?.code || ''));
};

const NotAvailable: React.FC = () => (
    <section className={styles.card}>
        <p className={styles.message}><T>This item is not available.</T></p>
    </section>
);

/** Small "Hebrew" tag when a text is shown in another language than the UI. */
const LangTag: React.FC<{ lang?: string }> = ({ lang }) => {
    const { language } = useTranslationContext();
    if (!lang || lang === language) return null;
    return <span className={styles.langTag}><T>{getLanguageName(lang)}</T></span>;
};

/** One text field; `lines` renders it line by line, as in a treatment (TreatmentExecution). */
const Field: React.FC<{ label: string; value: LocalizedText | null; lines?: boolean }> = ({ label, value, lines }) => {
    if (!value) return null;
    const paragraphs = lines ? value.text.split('\n').filter(line => line.trim() !== '') : [value.text];
    return (
        <div className={styles.field}>
            <h3 className={styles.fieldLabel}><T>{label}</T> <LangTag lang={value.lang} /></h3>
            {paragraphs.map((line, idx) => <p key={idx} className={styles.fieldText} dir="auto">{line}</p>)}
        </div>
    );
};

const RelatedList: React.FC<{ title: string; items: EntityRef[]; kb: KnowledgeBase; onOpen: (ref: EntityRef) => void }> = ({ title, items, kb, onOpen }) => {
    const { language } = useTranslationContext();
    if (items.length === 0) return null;
    return (
        <section className={styles.card}>
            <h3 className={styles.sectionHeader}><T>{title}</T> ({items.length})</h3>
            <ul className={styles.linkList}>
                {items.map(item => {
                    const name = entityName(kb, item, language);
                    return (
                        <li key={`${item.type}_${item.id}`}>
                            <button type="button" className={styles.entityLink} onClick={() => onOpen(item)}>
                                <span dir="auto">{name.text}</span>
                                <LangTag lang={name.lang} />
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

export default EntityView;
