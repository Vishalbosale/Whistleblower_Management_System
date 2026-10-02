const path = require("path");
const multer = require("multer");
const { storage } = require("../config/storage");

// Uploads are parsed into memory, checked, and only then handed to S3 by the
// controller (services/fileStorage.js) once the request is authorised and
// valid. Nothing is ever written to local disk, and a refused or unauthorised
// request leaves nothing behind in the bucket.

// Evidence and complaint attachments only. `sig` is the file's leading bytes;
// `null` marks plain text, which has no signature and is checked for binary
// content instead. Anything not listed is refused — including .html, .svg and
// executables, which staff would otherwise be opening from an anonymous source.
const PDF = [0x25, 0x50, 0x44, 0x46];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0];

const ALLOWED = {
    ".pdf": PDF,
    ".png": [0x89, 0x50, 0x4e, 0x47],
    ".jpg": [0xff, 0xd8, 0xff],
    ".jpeg": [0xff, 0xd8, 0xff],
    ".gif": [0x47, 0x49, 0x46, 0x38],
    ".docx": ZIP,
    ".xlsx": ZIP,
    ".pptx": ZIP,
    ".doc": OLE,
    ".xls": OLE,
    ".ppt": OLE,
    ".txt": null,
    ".csv": null
};

const UPLOAD_ERROR = "UNSUPPORTED_FILE";

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (!Object.prototype.hasOwnProperty.call(ALLOWED, ext)) {
        const error = new Error("This file type is not allowed. Upload a PDF, image, Office document or text file.");
        error.code = UPLOAD_ERROR;
        return cb(error);
    }

    cb(null, true);
};

const multerInstance = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: {
        fileSize: storage.upload.maxFileBytes,
        files: storage.upload.maxFiles,
        fields: 60,
        fieldSize: 1024 * 1024, // JSON-encoded complainant/respondents ride in text fields
        parts: 80
    }
});

const matchesSignature = (buffer, ext) => {
    const sig = ALLOWED[ext];

    if (sig) {
        return buffer.length >= sig.length && sig.every((byte, i) => buffer[i] === byte);
    }

    // Plain text must not contain NUL bytes.
    return !buffer.subarray(0, 8192).includes(0);
};

const uploadedFiles = (req) => (req.files ? [].concat(req.files) : req.file ? [req.file] : []);

// The declared extension must agree with what is actually in the file.
const verifyContent = (req, res, next) => {
    for (const file of uploadedFiles(req)) {
        if (!matchesSignature(file.buffer, path.extname(file.originalname).toLowerCase())) {
            return res.status(400).json({ message: `"${file.originalname}" does not match its file type.` });
        }
    }

    next();
};

// multer reports a refused or oversized upload as an error; surface it as a 400
// instead of letting it fall through to the 500 handler.
const handleUpload = (middleware) => (req, res, next) =>
    middleware(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error instanceof multer.MulterError || error.code === UPLOAD_ERROR) {
            const message =
                error.code === "LIMIT_FILE_SIZE"
                    ? `A file is larger than the ${storage.upload.maxFileBytes / 1024 / 1024} MB limit.`
                    : error.message;

            return res.status(400).json({ message });
        }

        next(error);
    });

// Same call shape as multer's (`upload.single("file")`, `upload.array(...)`),
// but each returns a middleware chain that also checks the file contents.
const upload = {
    single: (field) => [handleUpload(multerInstance.single(field)), verifyContent],
    array: (field, maxCount) => [handleUpload(multerInstance.array(field, maxCount)), verifyContent]
};

module.exports = { upload };
