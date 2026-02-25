/**
 * Utility to generate a combined image of a document template and signatures.
 */
export const generateDocumentImage = async (
    templateText: string,
    signatures: {
        label: string;
        dataUrl: string;
        name: string;
    }[],
    placeholders: Record<string, string>,
    direction: 'ltr' | 'rtl' = 'ltr'
): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    // A4 aspect ratio at 96 DPI (approx)
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

    // Replace placeholders
    let processedText = templateText;
    Object.entries(placeholders).forEach(([key, value]) => {
        const regex = new RegExp(`{${key}}|{{${key}}}`, 'g');
        processedText = processedText.replace(regex, value);
    });

    const lines = processedText.split('\n');
    lines.forEach(line => {
        y = wrapText(line, startX, y, maxWidth, 24);
    });

    y += 40;

    // Load images
    const loadImg = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = src;
        });
    };

    const blockWidth = 200;
    const sigHeight = 100;
    const spacing = 40;

    for (let i = 0; i < signatures.length; i++) {
        const sig = signatures[i];
        if (!sig.dataUrl) continue;

        const img = await loadImg(sig.dataUrl);

        // Arrange signatures horizontally if possible, or vertically if too many
        // For simplicity, we'll do 2 per row
        const row = Math.floor(i / 2);
        const col = i % 2;

        const currentY = y + (row * (sigHeight + 60));
        let currentX;

        if (isRtl) {
            currentX = canvas.width - margin - (col * (blockWidth + spacing)) - blockWidth;
            ctx.textAlign = 'right';
            ctx.font = 'bold 16px Georgia, serif';
            ctx.fillText(sig.label, canvas.width - margin - (col * (blockWidth + spacing)), currentY);
            ctx.font = '14px Georgia, serif';
            ctx.fillText(sig.name, canvas.width - margin - (col * (blockWidth + spacing)), currentY + 20);
            ctx.drawImage(img, currentX, currentY + 30, blockWidth, sigHeight);
        } else {
            currentX = margin + (col * (blockWidth + spacing));
            ctx.textAlign = 'left';
            ctx.font = 'bold 16px Georgia, serif';
            ctx.fillText(sig.label, currentX, currentY);
            ctx.font = '14px Georgia, serif';
            ctx.fillText(sig.name, currentX, currentY + 20);
            ctx.drawImage(img, currentX, currentY + 30, blockWidth, sigHeight);
        }
    }

    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob as Blob);
        }, 'image/png');
    });
};
