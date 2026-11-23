/**
 * Small runtime registry for model-facing agent tools.
 *
 * The registry keeps tool discovery and dispatch in one place without
 * coupling the application to a larger plugin framework.
 */

const SCHEMA_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatPath(path) {
  return path || 'arguments';
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (typeof left === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key)
      && valuesEqual(left[key], right[key]));
  }
  return false;
}

function assertSchemaDefinition(schema, path = 'parameters', depth = 0) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error(`Invalid tool schema at ${path}`);
  }
  if (depth > 16) throw new Error(`Tool schema is nested too deeply at ${path}`);

  if (Object.prototype.hasOwnProperty.call(schema, 'oneOf')) {
    if (!Array.isArray(schema.oneOf) || schema.oneOf.length < 1) {
      throw new Error(`${path}.oneOf must contain at least one schema`);
    }
    schema.oneOf.forEach((branch, index) => {
      assertSchemaDefinition(branch, `${path}.oneOf[${index}]`, depth + 1);
    });
    return;
  }

  if (!SCHEMA_TYPES.has(schema.type)) {
    throw new Error(`Invalid tool schema type "${String(schema.type)}" at ${path}`);
  }
  if (schema.enum !== undefined && !Array.isArray(schema.enum)) {
    throw new Error(`${path}.enum must be an array`);
  }
  if (schema.type === 'object') {
    if (schema.properties !== undefined && !isPlainObject(schema.properties)) {
      throw new Error(`${path}.properties must be an object`);
    }
    if (
      schema.additionalProperties !== undefined
      && typeof schema.additionalProperties !== 'boolean'
    ) {
      throw new Error(`${path}.additionalProperties must be boolean`);
    }
    if (schema.required !== undefined) {
      if (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== 'string')) {
        throw new Error(`${path}.required must be an array of strings`);
      }
    }
    Object.entries(schema.properties || {}).forEach(([key, propertySchema]) => {
      assertSchemaDefinition(propertySchema, `${path}.properties.${key}`, depth + 1);
    });
  }
  if (schema.type === 'array' && schema.items !== undefined) {
    assertSchemaDefinition(schema.items, `${path}.items`, depth + 1);
  }
  if (schema.type === 'string' && schema.pattern !== undefined) {
    try {
      new RegExp(schema.pattern);
    } catch {
      throw new Error(`${path}.pattern must be a valid regular expression`);
    }
  }
}

function validateSchemaValue(value, schema, path = '', depth = 0) {
  if (!schema || typeof schema !== 'object') {
    throw new Error(`Invalid tool schema at ${formatPath(path)}`);
  }
  if (depth > 16) throw new Error(`Tool arguments are nested too deeply at ${formatPath(path)}`);

  if (Array.isArray(schema.oneOf)) {
    const errors = [];
    for (const branch of schema.oneOf) {
      try {
        validateSchemaValue(value, branch, path, depth + 1);
        return;
      } catch (error) {
        errors.push(error.message);
      }
    }
    throw new Error(`${formatPath(path)} does not match any allowed shape: ${errors.join('; ')}`);
  }

  const type = schema.type;
  if (!SCHEMA_TYPES.has(type)) {
    throw new Error(`Invalid tool schema type "${String(type)}" at ${formatPath(path)}`);
  }
  const actualType = value === null
    ? 'null'
    : Array.isArray(value)
      ? 'array'
      : typeof value === 'number' && Number.isInteger(value)
        ? 'integer'
        : typeof value;
  const typeMatches = type === 'number' && actualType === 'integer'
    ? true
    : actualType === type;
  if (!typeMatches) {
    throw new Error(`${formatPath(path)} must be ${type}, received ${actualType}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.some(item => valuesEqual(item, value))) {
    throw new Error(`${formatPath(path)} must be one of: ${schema.enum.join(', ')}`);
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'const') && !valuesEqual(schema.const, value)) {
    throw new Error(`${formatPath(path)} must equal the declared constant`);
  }

  if (type === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      throw new Error(`${formatPath(path)} must contain at least ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      throw new Error(`${formatPath(path)} must contain at most ${schema.maxLength} characters`);
    }
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) {
      throw new Error(`${formatPath(path)} has an invalid format`);
    }
  }

  if (type === 'number' || type === 'integer') {
    if (!Number.isFinite(value)) throw new Error(`${formatPath(path)} must be finite`);
    if (schema.minimum !== undefined && value < schema.minimum) {
      throw new Error(`${formatPath(path)} must be at least ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      throw new Error(`${formatPath(path)} must be at most ${schema.maximum}`);
    }
  }

  if (type === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      throw new Error(`${formatPath(path)} must contain at least ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      throw new Error(`${formatPath(path)} must contain at most ${schema.maxItems} items`);
    }
    if (schema.items) {
      value.forEach((item, index) => validateSchemaValue(
        item,
        schema.items,
        `${formatPath(path)}[${index}]`,
        depth + 1,
      ));
    }
  }

  if (type === 'object') {
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        throw new Error(`${formatPath(path)}.${key} is required`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          throw new Error(`${formatPath(path)}.${key} is not supported`);
        }
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        validateSchemaValue(value[key], propertySchema, `${formatPath(path)}.${key}`, depth + 1);
      }
    }
  }
}

function cloneSchema(schema) {
  if (schema === undefined) return undefined;
  return JSON.parse(JSON.stringify(schema));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])]),
  );
}

export function canonicalizeAgentToolCall(name, args) {
  return JSON.stringify([String(name || '').trim(), canonicalize(args)]);
}

export function createAgentToolRegistry(definitions) {
  const entries = new Map();

  for (const [name, definition] of Object.entries(definitions || {})) {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) throw new Error('Agent tool name is required');
    if (!definition || typeof definition.execute !== 'function') {
      throw new Error(`Agent tool "${normalizedName}" must define execute()`);
    }
    if (definition.parameters !== undefined) assertSchemaDefinition(definition.parameters);
    if (
      definition.timeoutMs !== undefined
      && (!Number.isFinite(Number(definition.timeoutMs)) || Number(definition.timeoutMs) <= 0)
    ) {
      throw new Error(`Agent tool "${normalizedName}" timeoutMs must be positive`);
    }
    if (entries.has(normalizedName)) {
      throw new Error(`Agent tool "${normalizedName}" is registered more than once`);
    }
    entries.set(normalizedName, Object.freeze({
      name: normalizedName,
      description: String(definition.description || '').trim(),
      parameters: cloneSchema(definition.parameters || {
        type: 'object',
        properties: {},
        additionalProperties: false,
      }),
      timeoutMs: definition.timeoutMs === undefined ? null : Number(definition.timeoutMs),
      execute: definition.execute,
    }));
  }

  return Object.freeze({
    get(name) {
      return entries.get(String(name || '').trim()) || null;
    },
    has(name) {
      return entries.has(String(name || '').trim());
    },
    names() {
      return [...entries.keys()];
    },
    descriptions() {
      return Object.fromEntries(
        [...entries].map(([name, definition]) => [name, definition.description]),
      );
    },
    schemas() {
      return [...entries.values()].map(definition => ({
        name: definition.name,
        description: definition.description,
        parameters: cloneSchema(definition.parameters),
      }));
    },
    validate(name, args) {
      const definition = entries.get(String(name || '').trim());
      if (!definition) throw new Error(`Unknown agent tool: ${name}`);
      validateSchemaValue(args, definition.parameters, 'arguments');
      return args;
    },
  });
}
