import os
import re

directory = r"C:\Users\User\Dev\Projects\ApitherapyV2\src\components\PatientIntake"

css_files = [f for f in os.listdir(directory) if f.endswith('.css')]

replacements = [
    (re.compile(r'var\(--color-primary,\s*#c0392b\)', re.IGNORECASE), 'var(--color-primary)'),
    (re.compile(r'var\(--color-primary,\s*#2563eb\)', re.IGNORECASE), 'var(--color-primary)'),
    (re.compile(r'var\(--color-primary,\s*#3b82f6\)', re.IGNORECASE), 'var(--color-primary)'),
    (re.compile(r'var\(--color-border,\s*#e2e8f0\)', re.IGNORECASE), 'var(--color-border)'),
    (re.compile(r'var\(--color-border,\s*#e5e7eb\)', re.IGNORECASE), 'var(--color-border)'),
    (re.compile(r'var\(--color-background-input,\s*#f8fafc\)', re.IGNORECASE), 'var(--color-background-input)'),
    (re.compile(r'var\(--color-white,\s*#fff(fff)?\)', re.IGNORECASE), 'var(--color-white)'),
    (re.compile(r'var\(--color-text-secondary,\s*#64748b\)', re.IGNORECASE), 'var(--color-text-secondary)'),
    (re.compile(r'var\(--color-text-secondary,\s*#475569\)', re.IGNORECASE), 'var(--color-text-secondary)'),
    (re.compile(r'var\(--color-text-primary,\s*#1e293b\)', re.IGNORECASE), 'var(--color-text-primary)'),
    
    (re.compile(r'#16a34a', re.IGNORECASE), 'var(--color-success)'),
    (re.compile(r'#28a745', re.IGNORECASE), 'var(--color-success)'),
    (re.compile(r'#10b981', re.IGNORECASE), 'var(--color-success)'),
    (re.compile(r'#15803d', re.IGNORECASE), 'var(--color-success)'),
    (re.compile(r'#dc2626', re.IGNORECASE), 'var(--color-error)'),
    (re.compile(r'#ef4444', re.IGNORECASE), 'var(--color-error)'),
    (re.compile(r'#f59e0b', re.IGNORECASE), 'var(--color-warning)'),
    (re.compile(r'#fef2f2', re.IGNORECASE), 'var(--color-error-background)'),
    (re.compile(r'#c0392b', re.IGNORECASE), 'var(--color-primary)'),
    (re.compile(r'#3b82f6', re.IGNORECASE), 'var(--color-primary)'),
    (re.compile(r'#2563eb', re.IGNORECASE), 'var(--color-primary)'),
    (re.compile(r'#007bff', re.IGNORECASE), 'var(--color-primary)'),
    (re.compile(r'#1d4ed8', re.IGNORECASE), 'var(--color-primary-hover)'),
    
    (re.compile(r'#1e293b', re.IGNORECASE), 'var(--color-text-primary)'),
    (re.compile(r'#334155', re.IGNORECASE), 'var(--color-text-primary)'),
    (re.compile(r'#475569', re.IGNORECASE), 'var(--color-text-secondary)'),
    (re.compile(r'#64748b', re.IGNORECASE), 'var(--color-text-secondary)'),
    (re.compile(r'#6b7280', re.IGNORECASE), 'var(--color-text-secondary)'),
    (re.compile(r'#94a3b8', re.IGNORECASE), 'var(--color-text-tertiary)'),
    
    (re.compile(r'#cbd5e1', re.IGNORECASE), 'var(--color-border)'),
    (re.compile(r'#d1d5db', re.IGNORECASE), 'var(--color-border)'),
    (re.compile(r'#ccc(ccc)?', re.IGNORECASE), 'var(--color-border)'),
    (re.compile(r'#e2e8f0', re.IGNORECASE), 'var(--color-border-light)'),
    (re.compile(r'#e5e7eb', re.IGNORECASE), 'var(--color-border-light)'),
]

for file in css_files:
    file_path = os.path.join(directory, file)
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content
    for pattern, repl in replacements:
        new_content = pattern.sub(repl, new_content)
    
    if content != new_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated CSS tokens in {file}")
