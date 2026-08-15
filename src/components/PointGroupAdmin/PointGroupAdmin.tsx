import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../../firebase';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { collection, getDocs, updateDoc, deleteDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { PointGroup, PointGroupType, PointGroupLaterality } from '../../types/pointGroup';
import { PlusCircle, Edit, Trash2, Save, AlertTriangle, Loader, X, Search } from 'lucide-react';
import styles from '../PointsAdmin.module.css';
import { T, useT, useTranslationContext } from '../T';
import Tooltip from '../common/Tooltip';
import { logAction } from '../../services/auditLogService';

const TYPE_OPTIONS: PointGroupType[] = ['meridian', 'ex-point'];
const LATERALITY_OPTIONS: PointGroupLaterality[] = ['Paired', 'Midline-front', 'Midline-back', 'Unilateral'];

const PointGroupAdmin: React.FC = () => {
    const { getTranslation, registerString } = useTranslationContext();
    const [user, setUser] = useState<User | null>(null);
    const [pointGroups, setPointGroups] = useState<PointGroup[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingGroup, setEditingGroup] = useState<PointGroup | null>(null);
    const [deletingGroup, setDeletingGroup] = useState<PointGroup | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const stringsToRegister = useMemo(() => [
        'Point Grouping',
        'Failed to fetch point groups',
        'Code is required',
        'Code already exists',
        'Name is required',
        'Description is required',
        'Type is required',
        'Laterality is required',
        'Failed to save the point group',
        'Failed to delete the point group',
        'Cannot delete: referenced by points',
        'Delete Point Group',
        'Edit Point Group',
        'Add New Point Group',
        'Are you sure you want to delete the point group',
        'Confirm Delete',
        'Deleting...',
        'Saving...',
        'Save Point Group',
        'Search point groups...',
        'No point groups found',
        'Please log in',
        'Code',
        'Name',
        'Description',
        'Type',
        'Laterality',
        'Comment',
        'Status',
        'Active',
        'Inactive',
        'Actions',
        'Cancel',
        'meridian',
        'ex-point',
        'Paired',
        'Midline-front',
        'Midline-back',
        'Unilateral',
    ], []);

    useEffect(() => {
        stringsToRegister.forEach(s => registerString(s));
    }, [stringsToRegister, registerString]);

    const pointGroupsCollectionRef = React.useMemo(() => collection(db, 'cfg_point_groups'), []);

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (!currentUser) {
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const fetchPointGroups = useCallback(async () => {
        if (!user) {
            setPointGroups([]);
            return;
        }

        setIsLoading(true);
        try {
            const snapshot = await getDocs(pointGroupsCollectionRef);
            const fetched = snapshot.docs.map(d => ({ ...(d.data() as Omit<PointGroup, 'id'>), id: d.id }));
            fetched.sort((a, b) => a.code.localeCompare(b.code));
            setPointGroups(fetched);
            setError(null);
        } catch (err) {
            setError(getTranslation('Failed to fetch point groups'));
            console.error(err);
        }
        setIsLoading(false);
    }, [user, pointGroupsCollectionRef, getTranslation]);

    useEffect(() => {
        fetchPointGroups();
    }, [fetchPointGroups]);

    const filteredGroups = useMemo(() => {
        if (!searchTerm.trim()) return pointGroups;
        const term = searchTerm.toLowerCase().trim();
        return pointGroups.filter(g =>
            g.code.toLowerCase().includes(term) ||
            g.name.toLowerCase().includes(term) ||
            g.description.toLowerCase().includes(term)
        );
    }, [pointGroups, searchTerm]);

    const handleStartEditing = (group: PointGroup) => {
        setFormError(null);
        setEditingGroup({ ...group });
    };

    const handleAddNew = () => {
        setFormError(null);
        setEditingGroup({
            id: '',
            code: '',
            name: '',
            description: '',
            type: 'meridian',
            laterality: 'Paired',
            comment: '',
            status: 'active',
            reference_count: 0,
        });
    };

    const validateForm = (group: PointGroup, isNew: boolean): boolean => {
        if (!group.code.trim()) {
            setFormError(getTranslation('Code is required'));
            return false;
        }
        const codeExists = pointGroups.some(g => g.id !== group.id && g.code.trim().toLowerCase() === group.code.trim().toLowerCase());
        if (codeExists) {
            setFormError(getTranslation('Code already exists'));
            return false;
        }
        if (!group.name.trim()) {
            setFormError(getTranslation('Name is required'));
            return false;
        }
        if (!group.description.trim()) {
            setFormError(getTranslation('Description is required'));
            return false;
        }
        if (!group.type) {
            setFormError(getTranslation('Type is required'));
            return false;
        }
        if (!group.laterality) {
            setFormError(getTranslation('Laterality is required'));
            return false;
        }
        setFormError(null);
        return true;
    };

    const handleSave = async (groupToSave: PointGroup) => {
        const isNewGroup = !groupToSave.id;
        if (!validateForm(groupToSave, isNewGroup)) {
            return;
        }

        setIsSubmitting(true);
        try {
            const dataToSave: any = {
                code: groupToSave.code.trim(),
                name: groupToSave.name.trim(),
                description: groupToSave.description.trim(),
                type: groupToSave.type,
                laterality: groupToSave.laterality,
                comment: groupToSave.comment?.trim() || '',
                status: groupToSave.status || 'active',
                reference_count: groupToSave.reference_count || 0,
                updatedAt: serverTimestamp(),
            };

            if (isNewGroup) {
                dataToSave.createdAt = serverTimestamp();
                await addDoc(pointGroupsCollectionRef, dataToSave);
            } else {
                await updateDoc(doc(db, 'cfg_point_groups', groupToSave.id), dataToSave);
            }

            if (user) {
                logAction(user, {
                    category: 'config',
                    action: isNewGroup ? 'create' : 'update',
                    entityType: 'point_group',
                    entityId: groupToSave.id || '',
                    entityName: groupToSave.name.trim(),
                });
            }

            setEditingGroup(null);
            fetchPointGroups();
        } catch (err) {
            setFormError(getTranslation('Failed to save the point group'));
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (!deletingGroup) return;

        setIsSubmitting(true);
        try {
            // Log before delete — after deleteDoc, reactive state may re-render/unmount
            if (user) {
                logAction(user, {
                    category: 'config',
                    action: 'delete',
                    entityType: 'point_group',
                    entityId: deletingGroup.id,
                    entityName: deletingGroup.name,
                });
            }

            await deleteDoc(doc(db, 'cfg_point_groups', deletingGroup.id));
            fetchPointGroups();
        } catch (err) {
            setError(getTranslation('Failed to delete the point group'));
            console.error(err);
        }
        setIsSubmitting(false);
        setDeletingGroup(null);
    };

    const handleCancelEdit = () => {
        setEditingGroup(null);
        setFormError(null);
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}><T>Point Grouping</T></h1>
                <div className={styles.headerActions}>
                    <div className={styles.searchContainer}>
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder={getTranslation('Search point groups...')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={styles.searchInput}
                        />
                        {searchTerm && (
                            <button className={styles.clearSearch} onClick={() => setSearchTerm('')}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <button onClick={handleAddNew} className={styles.addButton}>
                        <PlusCircle size={18} className={styles.addButtonIcon} /> <T>Add New Point Group</T>
                    </button>
                </div>
            </div>

            {error && <p className={styles.errorBox}>{error}</p>}

            {editingGroup && (
                <EditPointGroupForm
                    group={editingGroup}
                    onSave={handleSave}
                    onCancel={handleCancelEdit}
                    error={formError}
                    isSubmitting={isSubmitting}
                />
            )}

            {deletingGroup && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent} style={{ maxWidth: 480, width: '90vw', height: 'auto' }}>
                        <div className={styles.modalHeader}>
                            <div className={styles.modalIconContainer}>
                                <AlertTriangle className={styles.modalIcon} aria-hidden="true" />
                            </div>
                            <div>
                                <h2 className={styles.modalTitle}><T>Delete Point Group</T></h2>
                                <p className={styles.modalText}>
                                    <T>Are you sure you want to delete the point group</T> '{deletingGroup.name}'?
                                </p>
                            </div>
                        </div>
                        <div className={styles.modalActions}>
                            <button onClick={() => setDeletingGroup(null)} disabled={isSubmitting} className={styles.cancelButton}><T>Cancel</T></button>
                            <button onClick={confirmDelete} disabled={isSubmitting} className={styles.confirmDeleteButton}>
                                {isSubmitting ? <T>Deleting...</T> : <T>Confirm Delete</T>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead className={styles.tableHeader}>
                        <tr>
                            <th scope="col" className={styles.headerCell}><T>Code</T></th>
                            <th scope="col" className={styles.headerCell}><T>Name</T></th>
                            <th scope="col" className={styles.headerCell}><T>Type</T></th>
                            <th scope="col" className={styles.headerCell}><T>Laterality</T></th>
                            <th scope="col" className={`${styles.headerCell} ${styles.descriptionCell}`}><T>Description</T></th>
                            <th scope="col" className={styles.headerCell}><T>Status</T></th>
                            <th scope="col" className={`${styles.headerCell} ${styles.actionsCell}`}><T>Actions</T></th>
                        </tr>
                    </thead>
                    <tbody className={styles.tableBody}>
                        {isLoading ? (
                            <tr><td colSpan={7} className={styles.loaderCell}><Loader className={styles.loader} size={32} /></td></tr>
                        ) : error ? (
                            <tr><td colSpan={7} className={styles.emptyCell}>{error}</td></tr>
                        ) : filteredGroups.length === 0 ? (
                            <tr><td colSpan={7} className={styles.emptyCell}>{!user ? <T>Please log in</T> : <T>No point groups found</T>}</td></tr>
                        ) : (
                            filteredGroups.map(group => (
                                <tr key={group.id} className={styles.tableRow}>
                                    <td className={`${styles.cell} ${styles.codeCell}`}>{group.code}</td>
                                    <td className={styles.cell}>{group.name}</td>
                                    <td className={styles.cell}><T>{group.type}</T></td>
                                    <td className={styles.cell}><T>{group.laterality}</T></td>
                                    <td className={`${styles.cell} ${styles.descriptionCell}`} title={group.description}>{group.description}</td>
                                    <td className={styles.cell}>
                                        <span className={`${styles.statusBadge} ${group.status === 'active' ? styles.badgeActive : styles.badgeInactive}`}>
                                            <T>{group.status === 'active' ? 'Active' : 'Inactive'}</T>
                                        </span>
                                    </td>
                                    <td className={`${styles.cell} ${styles.actionsCell}`}>
                                        <div className={styles.actionsWrapper}>
                                            <Tooltip text={useT('Edit Point Group')}>
                                                <button onClick={() => handleStartEditing(group)} className={styles.actionButton}><Edit size={18} /></button>
                                            </Tooltip>
                                            {group.reference_count > 0 ? (
                                                <Tooltip text={getTranslation('Cannot delete: referenced by points')}>
                                                    <button className={`${styles.actionButton} ${styles.deleteButtonDisabled}`} disabled>
                                                        <Trash2 size={18} />
                                                    </button>
                                                </Tooltip>
                                            ) : (
                                                <Tooltip text={useT('Delete Point Group')}>
                                                    <button onClick={() => setDeletingGroup(group)} className={`${styles.actionButton} ${styles.deleteButton}`}><Trash2 size={18} /></button>
                                                </Tooltip>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

interface EditPointGroupFormProps {
    group: PointGroup;
    onSave: (group: PointGroup) => void;
    onCancel: () => void;
    error: string | null;
    isSubmitting: boolean;
}

const EditPointGroupForm: React.FC<EditPointGroupFormProps> = ({ group, onSave, onCancel, error, isSubmitting }) => {
    const { getTranslation } = useTranslationContext();
    const [formData, setFormData] = useState(group);
    const [localError, setLocalError] = useState<string | null>(null);

    useEffect(() => {
        setFormData(group);
    }, [group]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value } as PointGroup));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.code.trim()) {
            setLocalError(getTranslation('Code is required')); return;
        }
        if (!formData.name.trim()) {
            setLocalError(getTranslation('Name is required')); return;
        }
        if (!formData.description.trim()) {
            setLocalError(getTranslation('Description is required')); return;
        }

        setLocalError(null);
        onSave(formData);
    };

    const isEditing = !!formData.id;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent} style={{ maxWidth: 640, width: '90vw', height: 'auto' }}>
                <div className={styles.formHeader}>
                    <h2 className={styles.formTitle}>{isEditing ? <T>Edit Point Group</T> : <T>Add New Point Group</T>}</h2>
                    <button onClick={onCancel} className={styles.closeButton}><X size={24} /></button>
                </div>
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.scrollableArea}>
                        {(error || localError) && <p className={styles.formError}>{error || localError}</p>}

                        <div className={styles.statusToggleContainer}>
                            <span className={styles.statusLabel}><T>Status</T>:</span>
                            <label className={styles.switch}>
                                <input
                                    type="checkbox"
                                    checked={formData.status === 'active'}
                                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.checked ? 'active' : 'inactive' }))}
                                />
                                <span className={styles.slider}></span>
                            </label>
                            <span className={`${styles.statusText} ${formData.status === 'active' ? styles.statusActive : styles.statusInactive}`}>
                                <T>{formData.status === 'active' ? 'Active' : 'Inactive'}</T>
                            </span>
                        </div>

                        <div className={`${styles.grid} ${styles['grid-cols-2']}`}>
                            <div>
                                <label htmlFor="code" className={styles.label}>
                                    <T>Code</T><span className={styles.requiredAsterisk}>*</span>
                                </label>
                                <input
                                    type="text"
                                    id="code"
                                    name="code"
                                    value={formData.code}
                                    onChange={handleChange}
                                    className={styles.input}
                                />
                            </div>
                            <div>
                                <label htmlFor="name" className={styles.label}>
                                    <T>Name</T><span className={styles.requiredAsterisk}>*</span>
                                </label>
                                <input
                                    type="text"
                                    id="name"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    className={styles.input}
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="description" className={styles.label}>
                                <T>Description</T><span className={styles.requiredAsterisk}>*</span>
                            </label>
                            <textarea
                                id="description"
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                className={styles.textarea}
                                rows={3}
                            ></textarea>
                        </div>

                        <div className={`${styles.grid} ${styles['grid-cols-2']}`}>
                            <div>
                                <label htmlFor="type" className={styles.label}>
                                    <T>Type</T><span className={styles.requiredAsterisk}>*</span>
                                </label>
                                <select
                                    id="type"
                                    name="type"
                                    value={formData.type}
                                    onChange={handleChange}
                                    className={styles.input}
                                >
                                    {TYPE_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{getTranslation(opt)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="laterality" className={styles.label}>
                                    <T>Laterality</T><span className={styles.requiredAsterisk}>*</span>
                                </label>
                                <select
                                    id="laterality"
                                    name="laterality"
                                    value={formData.laterality}
                                    onChange={handleChange}
                                    className={styles.input}
                                >
                                    {LATERALITY_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{getTranslation(opt)}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="comment" className={styles.label}><T>Comment</T></label>
                            <input
                                type="text"
                                id="comment"
                                name="comment"
                                value={formData.comment || ''}
                                onChange={handleChange}
                                className={styles.input}
                            />
                        </div>
                    </div>

                    <div className={styles.formActions}>
                        <button type="button" onClick={onCancel} disabled={isSubmitting} className={styles.cancelButton}><T>Cancel</T></button>
                        <button type="submit" disabled={isSubmitting} className={styles.saveButton}>
                            <Save size={16} />
                            {isSubmitting ? <T>Saving...</T> : <T>Save Point Group</T>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PointGroupAdmin;
