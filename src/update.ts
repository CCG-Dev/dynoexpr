import { DynamoDbValue, getAttrName, getAttrValue } from './helpers';

export type Update = Record<string, DynamoDbValue>;
export type UpdateAction = 'SET' | 'ADD' | 'DELETE' | 'REMOVE';
export type UpdateInput = Partial<{
  Update: Update;
  UpdateAction: UpdateAction;
  ExpressionAttributeNames: { [key: string]: string };
  ExpressionAttributeValues: { [key: string]: DynamoDbValue };
}>;
export type UpdateOutput = Partial<{
  UpdateExpression: string;
  ExpressionAttributeNames: { [key: string]: string };
  ExpressionAttributeValues: { [key: string]: DynamoDbValue };
}>;

type ParseOperationValueFn = (expr: string, key: string) => number;
export const parseOperationValue: ParseOperationValueFn = (expr, key) => {
  const v = expr.replace(key, ``).replace(/[+-]/, ``);
  return Number(v.trim());
};

type ExpressionAttributesMap = {
  ExpressionAttributeNames: { [key: string]: string };
  ExpressionAttributeValues: { [key: string]: DynamoDbValue };
};
type GetExpressionAttributesFn = (params: UpdateInput) => UpdateOutput;
export const getExpressionAttributes: GetExpressionAttributesFn = (params) => {
  const { Update = {} } = params;
  return Object.entries(Update).reduce((acc, [key, value]) => {
    if (!acc.ExpressionAttributeNames) acc.ExpressionAttributeNames = {};
    if (!acc.ExpressionAttributeValues) acc.ExpressionAttributeValues = {};
    acc.ExpressionAttributeNames[getAttrName(key)] = key;
    const v = /[+-]/.test(value as string)
      ? parseOperationValue(value as string, key)
      : value;
    acc.ExpressionAttributeValues[getAttrValue(v)] = v;
    return acc;
  }, params as ExpressionAttributesMap);
};

type GetUpdateExpressionFn = (params?: UpdateInput) => UpdateOutput;
export const getUpdateExpression: GetUpdateExpressionFn = (params = {}) => {
  if (!params.Update) return params;
  const { Update, UpdateAction = `SET`, ...restOfParams } = params;
  const {
    ExpressionAttributeNames = {},
    ExpressionAttributeValues = {},
  } = getExpressionAttributes(params);
  let entries = ``;
  switch (UpdateAction) {
    case 'SET':
      entries = Object.entries(Update)
        .map(([name, value]) => {
          // foo: `foo + 2`
          const [, operator] = /([+-])/.exec(value as string) || [];
          if (operator) {
            const expr = (value as string)
              .split(/[+-]/)
              .map((operand: string) => operand.trim())
              .map((operand: string) => {
                if (operand === name) return getAttrName(name);
                const v = parseOperationValue(operand, name);
                return getAttrValue(v);
              })
              .join(` ${operator} `);
            return `${getAttrName(name)} = ${expr}`;
          }
          return `${getAttrName(name)} = ${getAttrValue(value)}`;
        })
        .join(`, `);
      break;
    case 'ADD':
    case 'DELETE':
      entries = Object.entries(Update)
        .map(([name, value]) => [getAttrName(name), getAttrValue(value)])
        .map(([name, value]) => `${name} ${value}`)
        .join(`, `);
      break;
    case 'REMOVE':
      entries = Object.keys(ExpressionAttributeNames).join(`, `);
      break;
    default:
      break;
  }

  const parameters = {
    ...restOfParams,
    UpdateExpression: [UpdateAction, entries].join(` `),
    ExpressionAttributeNames,
    ExpressionAttributeValues,
  };

  if (UpdateAction === `REMOVE`) {
    delete parameters.ExpressionAttributeValues;
  }

  return parameters;
};
