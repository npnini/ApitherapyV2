
import React, { useState, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Questionnaire, Question } from '../../types/questionnaire';
import { useTranslation } from 'react-i18next';
import { Save, X, Plus, Trash2, GripVertical, ChevronDown } from 'lucide-react';
import styles from './QuestionnaireForm.module.css';

interface QuestionnaireFormProps {
    questionnaire: Questionnaire | null;
    onSave: (questionnaire: Questionnaire) => void;
    onCancel: () => void;
    isSubmitting: boolean;
    error: string | null;
    supportedLanguages: string[];
}

const QuestionnaireForm: React.FC<QuestionnaireFormProps> = ({ questionnaire, onSave, onCancel, isSubmitting, error, supportedLanguages }) => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState<Questionnaire | null>(questionnaire);

    useEffect(() => {
        setFormData(questionnaire);
    }, [questionnaire]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setFormData(currentData => {
                if (!currentData) return null;
                const oldIndex = currentData.questions.findIndex(q => q.name === active.id);
                const newIndex = currentData.questions.findIndex(q => q.name === over.id);
                if (oldIndex === -1 || newIndex === -1) return currentData;

                const reorderedQuestions = arrayMove(currentData.questions, oldIndex, newIndex);
                const updatedQuestions = reorderedQuestions.map((q, index) => ({ ...q, order: index + 1 }));

                return { ...currentData, questions: updatedQuestions };
            });
        }
    };

    const handleQuestionChange = (name: string, field: keyof Question, value: any) => {
        setFormData(currentData => {
            if (!currentData) return null;
            const updatedQuestions = currentData.questions.map(q => q.name === name ? { ...q, [field]: value } : q);
            return { ...currentData, questions: updatedQuestions };
        });
    };

    const handleTranslationChange = (questionName: string, langIndex: number, language: string, text: string) => {
        setFormData(currentData => {
            if (!currentData) return null;
            const updatedQuestions = currentData.questions.map(q => {
                if (q.name === questionName) {
                    const updatedTranslations = [...q.translations];
                    updatedTranslations[langIndex] = { language, text };
                    return { ...q, translations: updatedTranslations };
                }
                return q;
            });
            return { ...currentData, questions: updatedQuestions };
        });
    };

    const addQuestion = () => {
        setFormData(currentData => {
            if (!currentData) return null;
            const newOrder = currentData.questions.length + 1;
            let newName = `question_${newOrder}`;
            let i = 1;
            while(currentData.questions.some(q => q.name === newName)) {
                newName = `question_${newOrder}_${i++}`;
            }

            const newQuestion: Question = {
                order: newOrder,
                name: newName,
                type: 'string',
                translations: supportedLanguages.map(lang => ({ language: lang, text: '' }))
            };
            return { ...currentData, questions: [...currentData.questions, newQuestion] };
        });
    };

    const removeQuestion = (name: string) => {
        setFormData(currentData => {
            if (!currentData) return null;
            const filteredQuestions = currentData.questions.filter(q => q.name !== name);
            const updatedQuestions = filteredQuestions.map((q, index) => ({ ...q, order: index + 1 }));
            return { ...currentData, questions: updatedQuestions };
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (formData) onSave(formData);
    };

    if (!formData) return null;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <div className={styles.modalHeaderBar}>
                    <span className={styles.headerTitle}>{t('questionnaire_configuration')}</span>
                    <div className={styles.headerDetails}>
                        <span>{t('model')}: {formData.domain}</span>
                        <span>{t('version')}: {formData.versionNumber}</span>
                    </div>
                </div>
                <form onSubmit={handleSubmit} className={styles.form}>
                    {error && <p className={styles.formError}>{error}</p>}
                    <div className={styles.scrollableArea}>
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={formData.questions.map(q => q.name)} strategy={verticalListSortingStrategy}>
                                <table className={styles.questionTable}>
                                    <thead>
                                        <tr>
                                            <th></th>
                                            <th>{t('name')}</th>
                                            <th>{t('type')}</th>
                                            <th className={styles.actionsHeader}>{t('actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {formData.questions.map(q => (
                                            <DraggableQuestionRow
                                                key={q.name}
                                                question={q}
                                                onQuestionChange={handleQuestionChange}
                                                onTranslationChange={handleTranslationChange}
                                                onRemove={removeQuestion}
                                                supportedLanguages={supportedLanguages}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </SortableContext>
                        </DndContext>
                        <button type="button" onClick={addQuestion} className={styles.addButton}><Plus size={18} /> {t('addQuestion')}</button>
                    </div>

                    <div className={styles.formActions}>
                        <button type="button" onClick={onCancel} disabled={isSubmitting} className={styles.cancelButton}><X size={16} />{t('cancel')}</button>
                        <button type="submit" disabled={isSubmitting} className={styles.saveButton}>
                            <Save size={16} />{isSubmitting ? t('saving') : t('save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

interface DraggableQuestionRowProps {
    question: Question;
    onQuestionChange: (name: string, field: keyof Question, value: any) => void;
    onTranslationChange: (questionName: string, langIndex: number, language: string, text: string) => void;
    onRemove: (name: string) => void;
    supportedLanguages: string[];
}

const DraggableQuestionRow: React.FC<DraggableQuestionRowProps> = ({ question, onQuestionChange, onTranslationChange, onRemove, supportedLanguages }) => {
    const { t } = useTranslation();
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: question.name });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <>
            <tr ref={setNodeRef} style={style}>
                <td className={styles.dragHandle} {...attributes} {...listeners}><GripVertical size={18} /></td>
                <td><EditableTableCell value={question.name} onChange={value => onQuestionChange(question.name, 'name', value)} /></td>
                <td>
                    <select value={question.type} onChange={e => onQuestionChange(question.name, 'type', e.target.value)} className={styles.tableInput}>
                        <option value="string">{t('string')}</option>
                        <option value="number">{t('number')}</option>
                        <option value="boolean">{t('boolean')}</option>
                    </select>
                </td>
                <td className={styles.actionsCell}>
                    <button type="button" onClick={() => setIsExpanded(!isExpanded)} className={styles.expandButton}><ChevronDown size={16} /></button>
                    <button type="button" onClick={() => onRemove(question.name)} className={styles.removeButton}><Trash2 size={16} /></button>
                </td>
            </tr>
            {isExpanded && (
                <tr>
                    <td colSpan={4} className={styles.translationsCell}>
                        <div className={styles.translationsContainer}>
                            <h4 className={styles.translationsHeader}>{t('translations')}</h4>
                            {supportedLanguages.map((lang, index) => {
                                const translation = question.translations.find(t => t.language === lang) || { language: lang, text: '' };
                                return (
                                    <div key={lang} className={styles.translationRow}>
                                        <div className={styles.languageSelector}>{lang}</div>
                                        <input
                                            type="text"
                                            value={translation.text}
                                            onChange={e => onTranslationChange(question.name, index, lang, e.target.value)}
                                            className={styles.translationInput}
                                            placeholder={t('translation_placeholder', { lang })}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

interface EditableTableCellProps {
    value: string;
    onChange: (value: string) => void;
}

const EditableTableCell: React.FC<EditableTableCellProps> = ({ value, onChange }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState(value);

    useEffect(() => {
        setText(value);
    }, [value]);

    const handleBlur = () => {
        setIsEditing(false);
        if(text.trim() === '') {
            setText(value);
            return;
        }
        onChange(text);
    };

    return isEditing ? (
        <input type="text" value={text} onChange={e => setText(e.target.value)} onBlur={handleBlur} autoFocus className={styles.tableInput}/>
    ) : (
        <span onClick={() => setIsEditing(true)}>{text}</span>
    );
};

export default QuestionnaireForm;
