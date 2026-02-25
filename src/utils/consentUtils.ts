/**
 * Utility to generate a combined image of the consent document and signatures.
 */
export const generateConsentImage = async (
    templateText: string,
    patientSignature: string,
    caretakerSignature: string,
    patientName: string,
    caretakerName: string,
    direction: 'ltr' | 'rtl' = 'ltr'
): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    canvas.width = 794;
    canvas.height = 1123;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1e293b';
    ctx.font = '16px Georgia, serif';
    const margin = 50;
    const maxWidth = canvas.width - (margin * 2);
    let y = 80;

    const isRtl = direction === 'rtl';
    ctx.textAlign = isRtl ? 'right' : 'left';
    const startX = isRtl ? canvas.width - margin : margin;

    const wrapText = (text: string, x: number, startY: number, maxWidth: number, lineHeight: number) => {
        const words = text.replace(/<[^>]*>/g, '').split(' ');
        let line = '';
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && n > 0) {
                ctx.fillText(line, x, startY);
                line = words[n] + ' ';
                startY += lineHeight;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, x, startY);
        return startY + lineHeight;
    };

    const processedText = templateText
        .replace(/{{patientName}}/g, patientName)
        .replace(/{{caretakerName}}/g, caretakerName);

    const lines = processedText.split('\n');
    lines.forEach(line => {
        y = wrapText(line, startX, y, maxWidth, 24);
    });

    y += 40;

    // Load signatures
    const loadImg = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = src;
        });
    };

    const patientImg = await loadImg(patientSignature);
    const caretakerImg = await loadImg(caretakerSignature);

    const blockWidth = 200;
    const sigHeight = 100;

    if (isRtl) {
        // Draw Patient Block (Right)
        ctx.font = 'bold 16px Georgia, serif';
        ctx.fillText('חתימת המטופל:', canvas.width - margin, y);
        ctx.font = '14px Georgia, serif';
        ctx.fillText(patientName, canvas.width - margin, y + 20);
        ctx.drawImage(patientImg, canvas.width - margin - blockWidth, y + 30, blockWidth, sigHeight);

        // Draw Caretaker Block (Left)
        const leftSide = margin;
        ctx.textAlign = 'left';
        ctx.font = 'bold 16px Georgia, serif';
        ctx.fillText('חתימת המטפל:', leftSide, y);
        ctx.font = '14px Georgia, serif';
        ctx.fillText(caretakerName, leftSide, y + 20);
        ctx.drawImage(caretakerImg, leftSide, y + 30, blockWidth, sigHeight);
    } else {
        // Draw Patient Block (Left)
        ctx.font = 'bold 16px Georgia, serif';
        ctx.fillText('Patient Signature:', margin, y);
        ctx.font = '14px Georgia, serif';
        ctx.fillText(patientName, margin, y + 20);
        ctx.drawImage(patientImg, margin, y + 30, blockWidth, sigHeight);

        // Draw Caretaker Block (Right)
        const rightSide = canvas.width - margin - blockWidth;
        ctx.font = 'bold 16px Georgia, serif';
        ctx.textAlign = 'left';
        ctx.fillText('Caretaker Signature:', rightSide, y);
        ctx.font = '14px Georgia, serif';
        ctx.fillText(caretakerName, rightSide, y + 20);
        ctx.drawImage(caretakerImg, rightSide, y + 30, blockWidth, sigHeight);
    }

    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob as Blob);
        }, 'image/png');
    });
};
