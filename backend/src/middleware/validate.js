const { z } = require("zod");

// Shape checks only — type, length and format. Required-field and workflow
// rules stay in the controllers so their existing messages are unchanged; what
// this layer guarantees is that a handler never receives an object, array or
// number where it expects text (the `.trim()` crashes) or an oversized value.
const text = (max) => z.string().max(max).nullish();

// A positive integer, sent as a number or a digit string. "" is allowed
// because forms submit unselected dropdowns that way.
const id = z.union([z.number().int().positive(), z.string().regex(/^\d*$/).max(12)]).nullish();

const date = z
    .string()
    .max(40)
    .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), "must be a valid date")
    .nullish();

const idList = z.array(id).max(100).nullish();

// spec: { text: { field: maxLength }, ids: [field], dates: [field], idLists: [field] }
const validateBody = (spec) => {
    const shape = {};

    for (const [field, max] of Object.entries(spec.text || {})) shape[field] = text(max);
    for (const field of spec.ids || []) shape[field] = id;
    for (const field of spec.dates || []) shape[field] = date;
    for (const field of spec.idLists || []) shape[field] = idList;

    // Unknown fields pass through untouched; only the named ones are checked.
    const schema = z.object(shape).passthrough();

    return (req, res, next) => {
        const result = schema.safeParse(req.body || {});

        if (result.success) {
            return next();
        }

        const issue = result.error.issues[0];
        const field = issue.path.join(".");

        return res.status(400).json({ message: `Invalid value for "${field}"`, field });
    };
};

// Route params that name a database row must be plain integers. Rejecting
// anything else here keeps junk out of the SQL layer and stops probing.
const numericParams = (router, ...names) => {
    for (const name of names) {
        router.param(name, (req, res, next, value) => {
            if (/^\d{1,12}$/.test(value)) {
                return next();
            }

            return res.status(400).json({ message: `Invalid ${name}` });
        });
    }
};

// Filters arrive as `?status=1`. A repeated key (`?status=1&status=2`) parses
// to an array, which no handler expects.
const scalarQuery = (req, res, next) => {
    for (const [key, value] of Object.entries(req.query)) {
        if (typeof value !== "string") {
            return res.status(400).json({ message: `Invalid value for query parameter "${key}"` });
        }
    }

    next();
};

module.exports = { validateBody, numericParams, scalarQuery };
