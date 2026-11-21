/**
 * Utility to generate a combined image of a document template and signatures.
 * The image is A4 width; its height grows with the text so that the whole document
 * and the signatures below it always fit (at least one A4 page high).
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

    // A4 width at 96 DPI (approx); A4 height is the minimum height
    const A4_HEIGHT = 1123;
    canvas.width = 794;

    const margin = 50;
    const maxWidth = canvas.width - (margin * 2);
    const topY = 80;
    const lineHeight = 24;
    const textFont = '16px Georgia, serif';

    const isRtl = direction === 'rtl';
    const startX = isRtl ? canvas.width - margin : margin;

    // Replace placeholders
    let processedText = templateText;
    Object.entries(placeholders).forEach(([key, value]) => {
        const regex = new RegExp(`{${key}}|{{${key}}}`, 'g');
        processedText = processedText.replace(regex, value);
    });

    // 1. Lay out the text into lines (measured with the text font).
    //    An empty paragraph becomes an empty line (paragraph spacing).
    ctx.font = textFont;
    ctx.direction = direction;
    const lines: string[] = [];
    const paragraphs = processedText.split(/\n|<br\s*\/?>|<p>/i);
    paragraphs.forEach(p => {
        // Strip other HTML tags (like <b>) but keep the text
        const cleanP = p.replace(/<[^>]*>/g, '').trim();
        if (!cleanP) {
            lines.push('');
            return;
        }
        const words = cleanP.split(' ');
        let line = '';
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > maxWidth && n > 0) {
                lines.push(line.trim());
                line = words[n] + ' ';
            } else {
                line = testLine;
            }
        }
        lines.push(line.trim());
    });

    // 2. Size the canvas: text, then the signature rows (2 per row), then a bottom margin.
    const blockWidth = 200;
    const sigHeight = 100;
    const spacing = 40;
    const rowHeight = sigHeight + 60;
    const textEndY = topY + lines.length * lineHeight;
    const sigTopY = textEndY + 40;
    const sigRows = Math.ceil(signatures.length / 2);
    const contentBottom = sigRows > 0
        ? sigTopY + (sigRows - 1) * rowHeight + 30 + sigHeight
        : textEndY;
    // Setting the height resets the context state, so styles are set after this
    canvas.height = Math.max(A4_HEIGHT, Math.ceil(contentBottom + margin));

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 3. Draw the text
    ctx.fillStyle = '#1e293b';
    ctx.font = textFont;
    ctx.direction = direction; // Explicitly set direction for RTL/LTR font rendering
    ctx.textAlign = isRtl ? 'right' : 'left';
    let y = topY;
    lines.forEach(l => {
        if (l) ctx.fillText(l, startX, y);
        y += lineHeight;
    });

    // 4. Draw the signatures
    const loadImg = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = src;
        });
    };

    for (let i = 0; i < signatures.length; i++) {
        const sig = signatures[i];
        if (!sig.dataUrl) continue;

        const img = await loadImg(sig.dataUrl);

        // 2 signatures per row
        const row = Math.floor(i / 2);
        const col = i % 2;

        const currentY = sigTopY + (row * rowHeight);
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
