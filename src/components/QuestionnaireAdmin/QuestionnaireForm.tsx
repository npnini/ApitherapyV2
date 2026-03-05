import React, { useState, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Questionnaire, Question, QuestionGroup, Condition, Translation } from '../../types/questionnaire';
import { Save, X, Plus, Trash2, GripVertical, ChevronDown, ChevronRight, ChevronLeft, Layers, ListTodo } from 'lucide-react';
import styles from './QuestionnaireForm.module.css';
import { T, useT, useTranslationContext } from '../T';

interface QuestionnaireFormProps {
    questionnaire: Questionnaire | null;
    onSave: (questionnaire: Questionnaire) => void;
    onCancel: () => void;
    isSubmitting: boolean;
    error: string | null;
    supportedLanguages: string[];
}

const QuestionnaireForm: React.FC<QuestionnaireFormProps> = ({ questionnaire, onSave, onCancel, isSubmitting, error, supportedLanguages }) => {
    const { language, direction } = useTranslationContext();
    const [formData, setFormData] = useState<Questionnaire | null>(questionnaire);
    const [activeStep, setActiveStep] = useState<'groups' | 'questions'>('groups');

    useEffect(() => {
        if (questionnaire && !formData) {
            setFormData({
                ...questionnaire,
                groups: questionnaire.groups || []
            });
        }
    }, [questionnaire, formData]);

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
            while (currentData.questions.some(q => q.name === newName)) {
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

    const addGroup = () => {
        setFormData(currentData => {
            if (!currentData) return null;
            const newGroup: QuestionGroup = {
                id: `group_${Date.now()}`,
                translations: supportedLanguages.map(lang => ({ language: lang, text: '' })),
                logic: 'AND',
                conditions: [{ fieldName: 'gender', operator: 'equal', value: 'male' }]
            };
            return { ...currentData, groups: [...(currentData.groups || []), newGroup] };
        });
    };

    const removeGroup = (id: string) => {
        setFormData(currentData => {
            if (!currentData) return null;
            const updatedGroups = (currentData.groups || []).filter(g => g.id !== id);
            // Also clear group reference from questions
            const updatedQuestions = currentData.questions.map(q => q.groupId === id ? { ...q, groupId: undefined } : q);
            return { ...currentData, groups: updatedGroups, questions: updatedQuestions };
        });
    };

    const handleGroupChange = (id: string, field: keyof QuestionGroup, value: any) => {
        setFormData(currentData => {
            if (!currentData) return null;
            const updatedGroups = (currentData.groups || []).map(g => g.id === id ? { ...g, [field]: value } : g);
            return { ...currentData, groups: updatedGroups };
        });
    };

    const handleGroupTranslationChange = (groupId: string, langIndex: number, language: string, text: string) => {
        setFormData(currentData => {
            if (!currentData) return null;
            const updatedGroups = (currentData.groups || []).map(g => {
                if (g.id === groupId) {
                    const updatedTranslations = [...g.translations];
                    updatedTranslations[langIndex] = { language, text };
                    return { ...g, translations: updatedTranslations };
                }
                return g;
            });
            return { ...currentData, groups: updatedGroups };
        });
    };

    const handleConditionChange = (groupId: string, conditionIndex: number, field: keyof Condition, value: any) => {
        setFormData(currentData => {
            if (!currentData) return null;
            const updatedGroups = (currentData.groups || []).map(g => {
                if (g.id === groupId) {
                    const updatedConditions = [...g.conditions];
                    updatedConditions[conditionIndex] = { ...updatedConditions[conditionIndex], [field]: value };
                    return { ...g, conditions: updatedConditions };
                }
                return g;
            });
            return { ...currentData, groups: updatedGroups };
        });
    };

    const addCondition = (groupId: string) => {
        setFormData(currentData => {
            if (!currentData) return null;
            const updatedGroups = (currentData.groups || []).map(g => {
                if (g.id === groupId) {
                    const newCondition: Condition = { fieldName: 'age', operator: 'greater_than', value: 18 };
                    return {
                        ...g,
                        conditions: [...g.conditions, newCondition]
                    };
                }
                return g;
            });
            return { ...currentData, groups: updatedGroups };
        });
    };

    const removeCondition = (groupId: string, conditionIndex: number) => {
        setFormData(currentData => {
            if (!currentData) return null;
            const updatedGroups = (currentData.groups || []).map(g => {
                if (g.id === groupId) {
                    return { ...g, conditions: g.conditions.filter((_, i) => i !== conditionIndex) };
                }
                return g;
            });
            return { ...currentData, groups: updatedGroups };
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
                    <span className={styles.headerTitle}><T>Questionnaire Configuration</T></span>
                    <div className={styles.headerDetails}>
                        <span><T>Model</T>: {formData.domain}</span>
                        <span><T>Version</T>: {formData.versionNumber}</span>
                    </div>
                </div>

                <div className={styles.stepContainer}>
                    <div className={`${styles.step} ${activeStep === 'groups' ? styles.stepActive : ''}`}>
                        <span className={styles.stepNumber}>1</span>
                        <Layers size={18} />
                        <T>Question Groups</T>
                    </div>
                    <div className={`${styles.step} ${activeStep === 'questions' ? styles.stepActive : ''}`}>
                        <span className={styles.stepNumber}>2</span>
                        <ListTodo size={18} />
                        <T>Questions</T>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    {error && <p className={styles.formError}>{error}</p>}
                    <div className={styles.scrollableArea}>
                        {activeStep === 'groups' ? (
                            <div className={styles.groupsContainer}>
                                {(formData.groups || []).map(group => (
                                    <QuestionGroupEditor
                                        key={group.id}
                                        group={group}
                                        onGroupChange={handleGroupChange}
                                        onTranslationChange={handleGroupTranslationChange}
                                        onConditionChange={handleConditionChange}
                                        addCondition={addCondition}
                                        removeCondition={removeCondition}
                                        onRemove={() => removeGroup(group.id)}
                                        supportedLanguages={supportedLanguages}
                                    />
                                ))}
                                <button type="button" onClick={addGroup} className={styles.addButton}>
                                    {direction === 'ltr' && <Plus size={18} />}
                                    <span><T>Add Group</T></span>
                                    {direction === 'rtl' && <Plus size={18} />}
                                </button>
                            </div>
                        ) : (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={formData.questions.map(q => q.name)} strategy={verticalListSortingStrategy}>
                                    <div className={styles.tableWrapper}>
                                        <table className={styles.questionTable}>
                                            <thead>
                                                <tr>
                                                    <th></th>
                                                    <th><T>QUESTION ID</T></th>
                                                    <th><T>QUESTION TYPE</T></th>
                                                    <th><T>Group</T></th>
                                                    <th className={styles.actionsHeader}><T>Actions</T></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {formData.questions.map(q => (
                                                    <DraggableQuestionRow
                                                        key={q.name}
                                                        question={q}
                                                        groups={formData.groups || []}
                                                        onQuestionChange={handleQuestionChange}
                                                        onTranslationChange={handleTranslationChange}
                                                        onRemove={removeQuestion}
                                                        supportedLanguages={supportedLanguages}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </SortableContext>
                                <button type="button" onClick={addQuestion} className={styles.addButton}>
                                    {direction === 'ltr' && <Plus size={18} />}
                                    <span><T>Add Question</T></span>
                                    {direction === 'rtl' && <Plus size={18} />}
                                </button>
                            </DndContext>
                        )}
                    </div>

                    <div className={styles.formActions}>
                        <button type="button" onClick={onCancel} disabled={isSubmitting} className={styles.cancelButton}>
                            {direction === 'ltr' && <X size={16} />}
                            <span><T>Cancel</T></span>
                            {direction === 'rtl' && <X size={16} />}
                        </button>

                        {activeStep === 'groups' ? (
                            <button type="button" onClick={() => setActiveStep('questions')} className={styles.nextButton}>
                                {direction === 'ltr' && <ChevronRight size={16} className={styles.nextArrow} />}
                                <span><T>Next</T></span>
                                {direction === 'rtl' && <ChevronRight size={16} className={styles.nextArrow} />}
                            </button>
                        ) : (
                            <>
                                <button type="button" onClick={() => setActiveStep('groups')} className={styles.cancelButton}>
                                    {direction === 'ltr' && <ChevronLeft size={16} className={styles.backArrow} />}
                                    <span><T>Back</T></span>
                                    {direction === 'rtl' && <ChevronLeft size={16} className={styles.backArrow} />}
                                </button>
                                <button type="submit" disabled={isSubmitting} className={styles.saveButton}>
                                    {direction === 'ltr' && <Save size={16} />}
                                    <span>{isSubmitting ? <T>Saving...</T> : <T>Save</T>}</span>
                                    {direction === 'rtl' && <Save size={16} />}
                                </button>
                            </>
                        )}
                    </div>
                </form>
            </div >
        </div >
    );
};

interface QuestionGroupEditorProps {
    group: QuestionGroup;
    onGroupChange: (id: string, field: keyof QuestionGroup, value: any) => void;
    onTranslationChange: (groupId: string, langIndex: number, language: string, text: string) => void;
    onConditionChange: (groupId: string, conditionIndex: number, field: keyof Condition, value: any) => void;
    addCondition: (groupId: string) => void;
    removeCondition: (groupId: string, conditionIndex: number) => void;
    onRemove: () => void;
    supportedLanguages: string[];
}

const QuestionGroupEditor: React.FC<QuestionGroupEditorProps> = ({
    group, onGroupChange, onTranslationChange, onConditionChange,
    addCondition, removeCondition, onRemove, supportedLanguages
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const { language } = useTranslationContext();
    return (
        <div className={styles.groupSection}>
            <div className={styles.groupHeader}>
                <div className={styles.groupHeaderLeft}>
                    <h3 className={styles.localizedGroupName}>
                        {group.translations.find(t => t.language === language)?.text || group.translations.find(t => t.language === 'en')?.text || group.id}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <select
                            value={group.logic}
                            onChange={e => onGroupChange(group.id, 'logic', e.target.value)}
                            className={styles.logicSelect}
                        >
                            <option value="AND">AND</option>
                            <option value="OR">OR</option>
                        </select>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => setIsExpanded(!isExpanded)} className={styles.expandButton}>
                        <ChevronDown size={18} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }} />
                    </button>
                    <button type="button" onClick={onRemove} className={styles.removeButton}>
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className={styles.translationsContainer} style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>
                    <h4 className={styles.translationsHeader}><T>Translations</T></h4>
                    {supportedLanguages.map((lang, index) => (
                        <TranslationRow
                            key={lang}
                            lang={lang}
                            value={group.translations.find(t => t.language === lang)?.text || ''}
                            onChange={text => onTranslationChange(group.id, index, lang, text)}
                        />
                    ))}
                </div>
            )}

            <div className={styles.conditionsContainer}>
                <h4 className={styles.translationsHeader}><T>Visibility Conditions</T></h4>
                {group.conditions.map((condition, index) => (
                    <div key={index} className={styles.conditionRow}>
                        <select
                            value={condition.fieldName}
                            onChange={e => onConditionChange(group.id, index, 'fieldName', e.target.value)}
                            className={styles.conditionSelect}
                        >
                            <option value="gender"><T>Gender</T></option>
                            <option value="age"><T>Age</T></option>
                        </select>
                        <select
                            value={condition.operator}
                            onChange={e => onConditionChange(group.id, index, 'operator', e.target.value)}
                            className={styles.conditionSelect}
                        >
                            <option value="equal">=</option>
                            <option value="not_equal">≠</option>
                            <option value="greater_than">&gt;</option>
                            <option value="greater_equal">&ge;</option>
                            <option value="smaller_than">&lt;</option>
                            <option value="smaller_equal">&le;</option>
                        </select>
                        <input
                            type={condition.fieldName === 'age' ? 'number' : 'text'}
                            value={condition.value}
                            onChange={e => onConditionChange(group.id, index, 'value', condition.fieldName === 'age' ? parseInt(e.target.value) : e.target.value)}
                            className={styles.conditionInput}
                            placeholder="Value"
                        />
                        <button type="button" onClick={() => removeCondition(group.id, index)} className={styles.removeButton}>
                            <X size={14} />
                        </button>
                    </div>
                ))}
                <button type="button" onClick={() => addCondition(group.id)} className={styles.addButton} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                    <Plus size={14} /> <span><T>Add Condition</T></span>
                </button>
            </div>
        </div>
    );
};

const LANGUAGE_NAMES: Record<string, string> = {
    en: 'English',
    he: 'Hebrew',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    ar: 'Arabic',
    zh: 'Chinese',
    ru: 'Russian'
};

interface TranslationRowProps {
    lang: string;
    value: string;
    onChange: (text: string) => void;
}

const TranslationRow: React.FC<TranslationRowProps> = ({ lang, value, onChange }) => {
    const langName = useT(LANGUAGE_NAMES[lang] || lang);
    const placeholder = useT(`Enter translation for ${langName}`);

    return (
        <div className={styles.translationRow}>
            <div className={styles.languageSelector}>{langName}</div>
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                className={styles.translationInput}
                placeholder={placeholder}
            />
        </div>
    );
};

interface DraggableQuestionRowProps {
    question: Question;
    groups: QuestionGroup[];
    onQuestionChange: (name: string, field: keyof Question, value: any) => void;
    onTranslationChange: (questionName: string, langIndex: number, language: string, text: string) => void;
    onRemove: (name: string) => void;
    supportedLanguages: string[];
}

const DraggableQuestionRow: React.FC<DraggableQuestionRowProps> = ({ question, groups, onQuestionChange, onTranslationChange, onRemove, supportedLanguages }) => {
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
                        <option value="string"><T>String</T></option>
                        <option value="number"><T>Number</T></option>
                        <option value="boolean"><T>Boolean</T></option>
                    </select>
                </td>
                <td>
                    <select
                        value={question.groupId || ''}
                        onChange={e => onQuestionChange(question.name, 'groupId', e.target.value || undefined)}
                        className={styles.tableInput}
                    >
                        <option value=""><T>None</T></option>
                        {groups.map(g => (
                            <option key={g.id} value={g.id}>
                                {g.translations.find(t => t.language === 'en')?.text || g.id}
                            </option>
                        ))}
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
                            <h4 className={styles.translationsHeader}><T>Translations</T></h4>
                            {supportedLanguages.map((lang: string, index: number) => {
                                const translation = question.translations.find(t => t.language === lang) || { language: lang, text: '' };
                                return (
                                    <TranslationRow
                                        key={lang}
                                        lang={lang}
                                        value={translation.text}
                                        onChange={text => onTranslationChange(question.name, index, lang, text)}
                                    />
                                );
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
        if (text.trim() === '') {
            setText(value);
            return;
        }
        onChange(text);
    };

    return isEditing ? (
        <input type="text" value={text} onChange={e => setText(e.target.value)} onBlur={handleBlur} autoFocus className={styles.tableInput} />
    ) : (
        <span onClick={() => setIsEditing(true)}>{text}</span>
    );
};

export default QuestionnaireForm;
