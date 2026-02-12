
import React from 'react';
import { Problem } from '../../types/problem';
import { FileDown } from 'lucide-react';

interface ProblemDetailsProps {
  problem: Problem;
  onEdit: () => void;
  onBack: () => void;
}

const ProblemDetails: React.FC<ProblemDetailsProps> = ({ problem, onEdit, onBack }) => {
  return (
    <div>
      <button onClick={onBack}>Back to List</button>
      <h2>{problem.name}</h2>
      <p>{problem.description}</p>

      {problem.documentUrl && (
        <div>
          <h4>Document</h4>
          <a href={problem.documentUrl} target="_blank" rel="noopener noreferrer">
            <FileDown size={16} /> View Document
          </a>
        </div>
      )}

      <button onClick={onEdit}>Edit</button>
    </div>
  );
};

export default ProblemDetails;
