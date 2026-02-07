// --- Core Hex Logic ---

class HexFile {
    constructor() {
        // Map<AbsoluteAddress, ByteValue>
        this.data = new Map();
        this.minAddr = 0xFFFFFFFF;
        this.maxAddr = 0x00000000;
    }

    // Parse Intel HEX string content
    static parse(text) {
        const hexFile = new HexFile();
        const lines = text.split(/\r?\n/);
        let upperAddr = 0;
        
        // Regex to validate line format: :LLAAAATT[DD...]CC
        const hexRegex = /^:([0-9A-Fa-f]{2})([0-9A-Fa-f]{4})([0-9A-Fa-f]{2})([0-9A-Fa-f]*)([0-9A-Fa-f]{2})$/;

        for (let line of lines) {
            line = line.trim();
            if (line.length === 0) continue;
            if (line[0] !== ':') continue; // Skip non-hex lines

            const match = line.match(hexRegex);
            if (!match) {
                console.warn(`Invalid HEX line: ${line}`);
                continue;
            }

            const byteCount = parseInt(match[1], 16);
            const address = parseInt(match[2], 16);
            const type = parseInt(match[3], 16);
            const dataStr = match[4];
            const checksum = parseInt(match[5], 16);

            // Verify checksum
            let sum = 0;
            for (let i = 1; i < line.length; i += 2) {
                sum += parseInt(line.substr(i, 2), 16);
            }
            if ((sum & 0xFF) !== 0) {
                console.warn(`Checksum error on line: ${line}`);
                // Depending on strictness, we might throw here. 
                // For a tool, let's just warn and continue.
            }

            if (type === 0x00) {
                // Data Record
                const absAddr = upperAddr + address;
                for (let i = 0; i < byteCount; i++) {
                    const byteVal = parseInt(dataStr.substr(i * 2, 2), 16);
                    hexFile.data.set(absAddr + i, byteVal);
                }
                if (absAddr < hexFile.minAddr) hexFile.minAddr = absAddr;
                if (absAddr + byteCount - 1 > hexFile.maxAddr) hexFile.maxAddr = absAddr + byteCount - 1;

            } else if (type === 0x04) {
                // Extended Linear Address Record
                // Data contains the upper 16 bits
                if (byteCount === 2) {
                    upperAddr = parseInt(dataStr.substr(0, 4), 16) << 16;
                }
            } else if (type === 0x01) {
                // End Of File
                break;
            }
        }
        return hexFile;
    }

    merge(otherHex) {
        let overlapCount = 0;
        otherHex.data.forEach((value, key) => {
            if (this.data.has(key)) {
                overlapCount++;
            }
            this.data.set(key, value); // Overwrite logic (File B overwrites File A)
            if (key < this.minAddr) this.minAddr = key;
            if (key > this.maxAddr) this.maxAddr = key;
        });
        return overlapCount;
    }

    toString() {
        let lines = [];
        let currentSegment = -1;
        let buffer = [];
        let startAddr = 0;

        // Convert Map to sorted array for linear traversal
        const sortedKeys = Array.from(this.data.keys()).sort((a, b) => a - b);

        if (sortedKeys.length === 0) return ":00000001FF";

        for (let i = 0; i < sortedKeys.length; i++) {
            const addr = sortedKeys[i];
            const byte = this.data.get(addr);

            const segment = (addr >> 16) & 0xFFFF;
            const offset = addr & 0xFFFF;

            // 1. Check if we need a new segment record (0x04)
            if (segment !== currentSegment) {
                // Flush existing buffer if any
                if (buffer.length > 0) {
                    lines.push(generateDataLine(startAddr, buffer));
                    buffer = [];
                }
                
                // --- FIX IS HERE: Correct Type 04 Record Generation ---
                // ByteCount is 0x02, Address is 0x0000, Type is 0x04
                const segData = [segment >> 8, segment & 0xFF];
                const segChecksum = calculateChecksum(0x02, 0x0000, 0x04, segData);
                lines.push(`:02000004${segment.toString(16).padStart(4, '0').toUpperCase()}${segChecksum.toString(16).padStart(2, '0').toUpperCase()}`);
                
                currentSegment = segment;
            }

            // 2. Handle gaps in memory or 64k wrap-around
            if (buffer.length > 0) {
                const lastAddr = startAddr + buffer.length - 1;
                // If gap, or if we crossed 64k boundary
                if (addr !== lastAddr + 1 || (offset & 0xFFFF) < (lastAddr & 0xFFFF)) {
                    lines.push(generateDataLine(startAddr, buffer));
                    buffer = [];
                }
            }

            if (buffer.length === 0) {
                startAddr = addr;
            }
            
            buffer.push(byte);

            // 3. Force flush if buffer reaches 16 bytes (0x10)
            if (buffer.length >= 16) {
                lines.push(generateDataLine(startAddr, buffer));
                buffer = [];
            }
        }

        // Flush remaining buffer
        if (buffer.length > 0) {
            lines.push(generateDataLine(startAddr, buffer));
        }

        // EOF
        lines.push(":00000001FF");
        return lines.join("\n");
    }

    getSize() {
        return this.data.size;
    }
}

// --- FIX IS HERE: Updated function signature to accept 'type' ---
function calculateChecksum(byteCount, address, type, data) {
    let sum = byteCount + (address & 0xFF) + ((address >> 8) & 0xFF) + type;
    for (let b of data) {
        sum += b;
    }
    return ((~sum) + 1) & 0xFF;
}

function generateDataLine(address, bytes) {
    const byteCount = bytes.length;
    const offset = address & 0xFFFF;
    const type = 0x00; // Data Record Type
    
    // Pass type 0x00 here
    const checksum = calculateChecksum(byteCount, offset, type, bytes);
    
    let hexStr = `:${byteCount.toString(16).padStart(2,'0').toUpperCase()}${offset.toString(16).padStart(4,'0').toUpperCase()}${type.toString(16).padStart(2,'0').toUpperCase()}`;
    for (let b of bytes) {
        hexStr += b.toString(16).padStart(2, '0').toUpperCase();
    }
    hexStr += checksum.toString(16).padStart(2, '0').toUpperCase();
    return hexStr;
}


// --- UI Logic ---

const fileInputA = document.getElementById('input-a');
const fileInputB = document.getElementById('input-b');
const dropZoneA = document.getElementById('drop-zone-a');
const dropZoneB = document.getElementById('drop-zone-b');
const mergeBtn = document.getElementById('merge-btn');
const resultCard = document.getElementById('result-card');
const mergeLog = document.getElementById('merge-log');

let hexDataA = null;
let hexDataB = null;

function handleFileSelect(file, type) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const content = e.target.result;
            const parsed = HexFile.parse(content);
            
            if (parsed.getSize() === 0) {
                showToast(`File ${file.name} appears to be empty or invalid`, 'error');
                return;
            }

            if (type === 'A') {
                hexDataA = parsed;
                updateFileInfo('a', file.name, parsed);
            } else {
                hexDataB = parsed;
                updateFileInfo('b', file.name, parsed);
            }
            
            checkReady();
        } catch (err) {
            console.error(err);
            showToast(`Failed to parse file ${file.name}`, 'error');
        }
    };
    reader.readAsText(file);
}

function updateFileInfo(type, name, data) {
    const badge = document.getElementById(`badge-${type.toLowerCase()}`);
    const infoDiv = document.getElementById(`info-${type.toLowerCase()}`);
    const nameSpan = document.getElementById(`name-${type.toLowerCase()}`);
    const rangeSpan = document.getElementById(`range-${type.toLowerCase()}`);
    const sizeSpan = document.getElementById(`size-${type.toLowerCase()}`);

    badge.textContent = "Loaded";
    badge.style.background = "#dcfce7";
    badge.style.color = "#15803d";
    infoDiv.classList.add('active');
    
    nameSpan.textContent = name;
    sizeSpan.textContent = data.getSize() + " Bytes";
    rangeSpan.textContent = `0x${data.minAddr.toString(16).toUpperCase()} - 0x${data.maxAddr.toString(16).toUpperCase()}`;
}

function checkReady() {
    if (hexDataA && hexDataB) {
        mergeBtn.disabled = false;
    }
}

function setupDragDrop(zone, input, type) {
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            handleFileSelect(e.dataTransfer.files[0], type);
        }
    });
    input.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileSelect(e.target.files[0], type);
        }
    });
}

setupDragDrop(dropZoneA, fileInputA, 'A');
setupDragDrop(dropZoneB, fileInputB, 'B');

mergeBtn.addEventListener('click', () => {
    if (!hexDataA || !hexDataB) return;

    // Create a deep copy of A to merge into
    const merged = new HexFile();
    // Copy data
    hexDataA.data.forEach((v, k) => merged.data.set(k, v));
    merged.minAddr = hexDataA.minAddr;
    merged.maxAddr = hexDataA.maxAddr;

    // Merge B
    const overlaps = merged.merge(hexDataB);

    // Generate Result
    const hexString = merged.toString();
    const blob = new Blob([hexString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const dlBtn = document.getElementById('download-btn');
    dlBtn.onclick = () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'merged_output.hex';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // Update Stats
    document.getElementById('result-size').textContent = merged.getSize() + " Bytes";
    document.getElementById('result-range').textContent = `0x${merged.minAddr.toString(16).toUpperCase()} - 0x${merged.maxAddr.toString(16).toUpperCase()}`;
    
    // Log
    let log = `Merge Complete!\n`;
    log += `Base File (A): ${hexDataA.getSize()} bytes\n`;
    log += `Overlay File (B): ${hexDataB.getSize()} bytes\n`;
    log += `Merged Result: ${merged.getSize()} bytes\n`;
    if (overlaps > 0) {
        log += `\nWarning: Detected ${overlaps} overlapping addresses. Data from File B has overwritten File A.\n`;
    } else {
        log += `\nNo address conflicts detected.\n`;
    }
    mergeLog.textContent = log;

    resultCard.classList.add('visible');
    resultCard.scrollIntoView({ behavior: 'smooth' });
});

// Toast Helper
function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.background = type === 'error' ? '#ef4444' : '#334155';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

