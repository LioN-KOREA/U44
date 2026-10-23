// An in-memory stand-in for the DynamoDB calls, used by the asset tests.
//
// It interprets the command input that the DBOps descriptors produce - keys, the begins_with filter,
// the update expression, the condition - rather than stubbing the calls out at the manager level.
// That is deliberate: the sort-key layout and the expression names live in U44Assets.dbops.ts, and a
// mock that ignored them would pass just as happily with either of those wrong.

import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import type {
    DeleteOps,
    DynamoDBResponse,
    GetOps,
    PutOps,
    QueryOps,
    UpdateOps,
} from "../src/utils/aws/DynamoDBUtils.js";

type Item = Record<string, AttributeValue>;

/** "<PK>|<SK>" -> item. The real table is keyed the same way, by U44PK and U44SK. */
export const items = new Map<string, Item>();

const requireString = (value: AttributeValue | undefined, what: string): string => {
    const found = value?.S;
    if (found == null) throw new Error(`fake DynamoDB: ${what} has to be a string attribute`);
    return found;
};

const itemKey = (key: Record<string, AttributeValue>): string =>
    `${requireString(key.U44PK, "U44PK")}|${requireString(key.U44SK, "U44SK")}`;

const ok = <T>(data: T): DynamoDBResponse<T> => ({ data, status: 200, message: "ok" });

/** DynamoDB reports a failed condition by throwing, and the manager relies on the name. */
class ConditionalCheckFailedException extends Error {
    constructor() {
        super("The conditional request failed");
        this.name = "ConditionalCheckFailedException";
    }
}

/**
 * Evaluate a ConditionExpression against the stored item (undefined when there is none).
 *
 * Covers what this codebase writes: attribute_exists / attribute_not_exists, the comparisons
 * `<`, `>`, `=`, and AND / OR with parentheses. Anything else throws, so a condition this fake
 * cannot read fails the test rather than passing it by accident.
 */
function conditionHolds(
    expression: string,
    stored: Item | undefined,
    names: Record<string, string>,
    values: Record<string, AttributeValue>,
): boolean {
    const tokens = expression.match(/\(|\)|<|>|=|[A-Za-z_#:][A-Za-z0-9_#:]*/g) ?? [];
    let at = 0;
    const peek = () => tokens[at];
    const next = () => {
        const token = tokens[at++];
        if (token == null) throw new Error(`fake DynamoDB: the condition ended early (${expression})`);
        return token;
    };
    const attribute = (token: string) => {
        const name = token.startsWith("#") ? names[token] : token;
        if (name == null) throw new Error(`ValidationException: ExpressionAttributeNames has no entry for ${token}`);
        return name;
    };
    const operand = (token: string): string | number | undefined => {
        const value = token.startsWith(":") ? values[token] : stored?.[attribute(token)];
        if (token.startsWith(":") && value == null) {
            throw new Error(`ValidationException: ExpressionAttributeValues has no entry for ${token}`);
        }
        if (value?.N != null) return Number(value.N);
        return value?.S;
    };

    const primary = (): boolean => {
        const token = next();
        if (token === "(") {
            const inner = or();
            if (next() !== ")") throw new Error(`fake DynamoDB: unbalanced parentheses (${expression})`);
            return inner;
        }
        if (token === "attribute_exists" || token === "attribute_not_exists") {
            if (next() !== "(") throw new Error(`fake DynamoDB: cannot read ${token} (${expression})`);
            const name = attribute(next());
            const exists = stored != null && stored[name] != null;
            if (next() !== ")") throw new Error(`fake DynamoDB: cannot read ${token} (${expression})`);
            return token === "attribute_exists" ? exists : !exists;
        }
        const operator = next();
        const left = operand(token);
        const right = operand(next());
        // DynamoDB: a comparison against a missing attribute is false.
        if (left == null || right == null) return false;
        if (operator === "<") return left < right;
        if (operator === ">") return left > right;
        if (operator === "=") return left === right;
        throw new Error(`fake DynamoDB: unsupported operator ${operator} (${expression})`);
    };
    const and = (): boolean => {
        let result = primary();
        while (peek()?.toUpperCase() === "AND") {
            next();
            const right = primary();
            result = result && right;
        }
        return result;
    };
    const or = (): boolean => {
        let result = and();
        while (peek()?.toUpperCase() === "OR") {
            next();
            const right = and();
            result = result || right;
        }
        return result;
    };

    const result = or();
    if (at !== tokens.length) throw new Error(`fake DynamoDB: could not read the whole condition (${expression})`);
    return result;
}

export async function dynamoDBPut(ops: PutOps): Promise<DynamoDBResponse<string>> {
    const item = ops.input.Item;
    if (!item) throw new Error("fake DynamoDB: PutItem needs an Item");
    items.set(itemKey(item), { ...item });
    return ok("fake-request-id");
}

export async function dynamoDBGet<T>(ops: GetOps<T>): Promise<DynamoDBResponse<T>> {
    const key = ops.input.Key;
    if (!key) throw new Error("fake DynamoDB: GetItem needs a Key");
    return ok(ops.mapper(items.get(itemKey(key))));
}

export async function dynamoDBQuery<T>(ops: QueryOps<T>, _limit?: number, scanIndexForward?: boolean): Promise<DynamoDBResponse<T>> {
    const values = ops.input.ExpressionAttributeValues ?? {};
    const pk = requireString(values[":pk"], ":pk");
    const skPrefix = values[":sk"]?.S;

    const matched = [...items.values()]
        .filter(item => item.U44PK?.S === pk)
        .filter(item => skPrefix == null || (item.U44SK?.S ?? "").startsWith(skPrefix))
        .sort((a, b) => (a.U44SK?.S ?? "").localeCompare(b.U44SK?.S ?? ""));
    if (scanIndexForward === false) matched.reverse();

    return ok(ops.mapper(matched));
}

/**
 * Apply a "SET #a = :a, #b = :b" update.
 *
 * An alias that is missing from ExpressionAttributeNames throws here, exactly as the service would -
 * which is what makes this fake worth having over a stub.
 */
export async function dynamoDBUpdate(ops: UpdateOps): Promise<DynamoDBResponse<string>> {
    const key = ops.input.Key;
    if (!key) throw new Error("fake DynamoDB: UpdateItem needs a Key");
    const stored = items.get(itemKey(key));

    const condition = ops.input.ConditionExpression;
    if (condition && !conditionHolds(condition, stored, ops.input.ExpressionAttributeNames ?? {}, ops.input.ExpressionAttributeValues ?? {})) {
        throw new ConditionalCheckFailedException();
    }

    const expression = ops.input.UpdateExpression ?? "";
    if (!expression.trim().toUpperCase().startsWith("SET ")) {
        throw new Error(`fake DynamoDB: only SET updates are supported (${expression})`);
    }
    const names = ops.input.ExpressionAttributeNames ?? {};
    const values = ops.input.ExpressionAttributeValues ?? {};
    const updated: Item = { ...(stored ?? key) };

    for (const assignment of expression.slice(4).split(",")) {
        const [rawName, rawValue] = assignment.split("=").map(part => part.trim());
        if (!rawName || !rawValue) throw new Error(`fake DynamoDB: cannot read the assignment "${assignment}"`);
        const attribute = rawName.startsWith("#") ? names[rawName] : rawName;
        if (attribute == null) {
            throw new Error(`ValidationException: ExpressionAttributeNames has no entry for ${rawName}`);
        }
        const value = values[rawValue];
        if (value == null) {
            throw new Error(`ValidationException: ExpressionAttributeValues has no entry for ${rawValue}`);
        }
        updated[attribute] = value;
    }

    items.set(itemKey(key), updated);
    return ok("fake-request-id");
}

export async function dynamoDBDelete(ops: DeleteOps): Promise<DynamoDBResponse<string>> {
    const key = ops.input.Key;
    if (!key) throw new Error("fake DynamoDB: DeleteItem needs a Key");
    items.delete(itemKey(key));
    return ok("fake-request-id");
}
