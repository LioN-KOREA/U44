import { type AttributeValue, BatchGetItemCommand, type BatchGetItemCommandInput, type BatchGetItemCommandOutput, BatchWriteItemCommand, type BatchWriteItemCommandInput, DeleteItemCommand, type DeleteItemCommandInput, DynamoDBClient, GetItemCommand, type GetItemCommandInput, type GetItemCommandOutput, type KeysAndAttributes, PutItemCommand, type PutItemCommandInput, QueryCommand, type QueryCommandInput, TransactWriteItemsCommand, type TransactWriteItemsCommandInput, UpdateItemCommand, type UpdateItemCommandInput } from "@aws-sdk/client-dynamodb";

// A singleton client for all
let dynamoDBClient: DynamoDBClient | null = null;

export function getClient(): DynamoDBClient {
  if (dynamoDBClient) {
    return dynamoDBClient;
  }
  dynamoDBClient = new DynamoDBClient({
    maxAttempts: 10,

  });
  return dynamoDBClient;
}

export function objToDynamoDBItem(input: Record<string, unknown>, handleNullish: "null" | "stringify" | "throw" | "ignore" = "null") {
  const valueToAttributeValue
    : (input: unknown, handleNullish: "null" | "stringify" | "throw" | "ignore")
      => (AttributeValue | null) =
    (input, handleNullish) => {
      if (input != null) {
        if (Array.isArray(input)) {
          const convertedListAttrs: Array<AttributeValue | null> = input.map(x => valueToAttributeValue(x, handleNullish));
          let normalizedListAttrs: Array<AttributeValue> | null = null;
          if (handleNullish === "null") {
            normalizedListAttrs = convertedListAttrs.map(x => x != null ? x : { NULL: true })
          } else if (handleNullish === "ignore") {
            normalizedListAttrs = convertedListAttrs.filter(x => !!x);
          } else if (handleNullish === "stringify") {
            normalizedListAttrs = convertedListAttrs.map(x => x != null ? x : { S: "null" });
          } else if (handleNullish === "throw") {
            if (convertedListAttrs.every(x => x != null)) {
              normalizedListAttrs = convertedListAttrs;
            }
          }
          if (normalizedListAttrs == null) {
            throw new Error("An array contained a null value!")
          }
          return { L: normalizedListAttrs };
        } else if (input instanceof Set) {
          const setToArray = Array.from(input);
          if (setToArray.length > 0) {
            if (typeof setToArray[0] === "number" || typeof setToArray[0] === "bigint") {
              return { NS: setToArray.map(x => x.toString()) };
            } else if (setToArray[0] instanceof Uint8Array) {
              return { BS: setToArray.filter(bs => (bs instanceof Uint8Array)) };
            } else {
              return { SS: setToArray.map(x => x.toString()) };
            }
          } else {
            return { L: [] };
          }
        } else if (input instanceof Uint8Array) {
          return { B: input };
        }
        switch (typeof input) {
          case "string":
            return { S: input };
          case "number":
          case "bigint":
            return { N: input.toString() };
          case "boolean":
            return { BOOL: input };
          case "symbol":
            return { S: input.toString() }
          case "function":
            return { S: `FUNCTION: ${input.name}` }
          case "object":
            const inputRecord = input as Record<string, unknown>
            const reducedAttrValues = Object.keys(inputRecord).reduce((pv, cv) => {
              let currentValue = valueToAttributeValue(inputRecord[cv], handleNullish);
              if (currentValue == null) {
                if (handleNullish === "ignore") {
                  return pv;
                } else if (handleNullish === "throw") {
                  throw new Error(`A nullish value was found for the nested object's key: ${cv}`);
                } else if (handleNullish === "stringify") {
                  currentValue = { S: currentValue === null ? "null" : "undefined" }
                } else { // handleNullish === null
                  currentValue = { NULL: true }
                }
              }
              pv[cv] = currentValue;
              return pv;
            }, {} as Record<string, AttributeValue>);
            return { M: reducedAttrValues };
        }
      }
      return null;
    }

  const returnObject: Record<string, AttributeValue> = {}
  Object.keys(input).forEach(x => {
    let currentValue = valueToAttributeValue(input[x], handleNullish);
    if (currentValue == null) {
      if (handleNullish === "ignore") {
        return;
      } else if (handleNullish === "throw") {
        throw new Error(`A nullish value was found for the provided object's key: ${x}`);
      } else if (handleNullish === "stringify") {
        currentValue = { S: currentValue === null ? "null" : "undefined" }
      } else { // handleNullish === "null"
        currentValue = { NULL: true }
      }
    }
    returnObject[x] = currentValue
  });
  return returnObject;
}

export const dynamoDBItemToObj: (item: Record<string, AttributeValue>) => Record<string, unknown> = (item) => {
  const extractAttributes: (currentAttribute: AttributeValue) => unknown = (currentAttribute) => {
    if (currentAttribute.B) {
      return currentAttribute.B;
    } else if (currentAttribute.BOOL) {
      return currentAttribute.BOOL;
    } else if (currentAttribute.BS) {
      return currentAttribute.BS;
    } else if (currentAttribute.L) {
      const mappedToValues = currentAttribute.L.map(x => extractAttributes(x));
      if (mappedToValues.some(x => typeof x === "number") && !mappedToValues.every(x => typeof x === "number")) {
        return mappedToValues.map(x => String(x))
      }
      return mappedToValues;
    } else if (currentAttribute.M) {
      return Object.keys(currentAttribute.M).reduce((pv, cv) => { pv[cv] = currentAttribute.M[cv] ? extractAttributes(currentAttribute.M[cv]) : undefined; return pv; }, {} as Record<string, unknown>)
    } else if (currentAttribute.N) {
      currentAttribute.N >= Number.MAX_SAFE_INTEGER.toString() ? currentAttribute.N : Number(currentAttribute.N);
    } else if (currentAttribute.NS) {
      return currentAttribute.NS.some(x => x >= Number.MAX_SAFE_INTEGER.toString()) ? currentAttribute.NS : currentAttribute.NS.map(x => Number(x));
    } else if (currentAttribute.NULL) {
      return null;
    } else if (currentAttribute.S) {
      return currentAttribute.S;
    } else if (currentAttribute.SS) {
      return currentAttribute.SS;
    }
    return undefined; // probably should NEVER happen, since all dynamoDB objects are required to have a value
  }
  const returnObject: Record<string, unknown> = {};
  Object.keys(item).forEach(fe => {
    returnObject[fe] = item[fe] ? extractAttributes(item[fe]) : undefined;
  });
  return returnObject;
}

export const encodeKey: (key: Record<string, AttributeValue> | Record<string, KeysAndAttributes> | Record<number, Record<string, AttributeValue>> | null | undefined) => string | null = (key) => {
  if (!key) return null;
  const jsonStr = JSON.stringify(key);
  return Buffer.from(jsonStr).toString('base64url');
}

/**
 * Decodes a URL-safe Base64 token back into a DynamoDB key object
 */
export const decodeUnprocessedKeys: (token: string | null | undefined) => Record<string, KeysAndAttributes> | null = (token) => {
  if (!token) return null;
  try {
    const jsonStr = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    const parsedkeys = Object.keys(parsed);
    if (parsedkeys.length == 0) return null;
    for (const parsedkey of parsedkeys) {
      if (!parsed[parsedkey].Keys || !Array.isArray(parsed[parsedkey].Keys)) {
        return null;
      }
    }
    return parsed as Record<string, KeysAndAttributes>
  } catch (error) {
    console.error('Invalid pagination or identification token provided.');
    return null;
  }
}

export const decodeShardedLastEvaluatedKey: (token: string | null | undefined) => Record<number, Record<string, AttributeValue>> | null = (token) => {
  if (!token) return null;
  try {
    const jsonStr = Buffer.from(token, 'base64url').toString('utf8');
    const parsedShardedKey = JSON.parse(jsonStr);
    const parsedShards = Object.keys(parsedShardedKey).map(Number);
    if (parsedShards.length == 0) return null;
    for (const shardNo of parsedShards) {
      const currentShardKey = parsedShardedKey[shardNo];
      if (!currentShardKey) return null;
      const eachShardKeyObjKeys = Object.keys(currentShardKey);
      if (eachShardKeyObjKeys.length === 0) return null;
      for (const eachParsedKey of eachShardKeyObjKeys) {
        if (!currentShardKey[eachParsedKey].S
          && !currentShardKey[eachParsedKey].N
          && !currentShardKey[eachParsedKey].B
          && !currentShardKey[eachParsedKey].SS
          && !currentShardKey[eachParsedKey].NS
          && !currentShardKey[eachParsedKey].BS
          && !currentShardKey[eachParsedKey].M
          && !currentShardKey[eachParsedKey].L
          && !currentShardKey[eachParsedKey].NULL
          && !currentShardKey[eachParsedKey].BOOL
        ) {
          return null;
        }
      }
    }
    return parsedShardedKey as Record<number, Record<string, AttributeValue>>;
  } catch (error) {
    console.error('Invalid pagination or identification token provided.');
    return null;
  }
}

export const decodeLastEvaluatedKey: (token: string | null | undefined) => Record<string, AttributeValue> | null = (token) => {
  if (!token) return null;
  try {
    const jsonStr = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    const parsedkeys = Object.keys(parsed);
    if (parsedkeys.length == 0) return null;
    for (const parsedkey of parsedkeys) {
      if (!parsed[parsedkey].S
        && !parsed[parsedkey].N
        && !parsed[parsedkey].B
        && !parsed[parsedkey].SS
        && !parsed[parsedkey].NS
        && !parsed[parsedkey].BS
        && !parsed[parsedkey].M
        && !parsed[parsedkey].L
        && !parsed[parsedkey].NULL
        && !parsed[parsedkey].BOOL
      ) {
        return null;
      }
    }
    return parsed as Record<string, AttributeValue>
  } catch (error) {
    console.error('Invalid pagination or identification token provided.');
    return null;
  }
}

export interface DynamoDBResponse<T> {
  data: T,
  message: string,
  status: number,
  lastEvaluatedKey?: string,
  unprocessedKeys?: string,
}

export interface DynamoDBShardedQueryResponse<T> {
  data: T,
  message: string,
  status: number,
  lastEvaluatedKey?: string,
}


/** Pure descriptor produced by per-domain DBOps. */
export interface QueryOps<T> {
  input: QueryCommandInput;
  mapper: (items: Record<string, AttributeValue>[] | undefined) => T;
}

export interface QueryOpsSharded<T> {
  input: { shardNo: number, input: QueryCommandInput }[];
  /* 
    Note : When querying on a GSI, 
    BOTH the base table's PK/SK AND the GSI's PK/SK MUST be extracted. 
    Failure to do so will result in validation errors.
   */
  keyExtractor: (item: Record<string, AttributeValue>) => Record<string, AttributeValue>
  /* 
    a > b : 1, a == b : 0, a < b : -1 
    NOTE: make sure that you compare ALL the applicable keys (PK, SK) to make sure
    that the items are sorted properly.
    Failure to do so will result in unexpected behaviors. 
   */
  itemKeyComparator: (a: Record<string, AttributeValue>, b: Record<string, AttributeValue>) => -1 | 0 | 1;
  mapper: (items: Record<string, AttributeValue>[] | undefined) => T[];
}

export interface GetOps<T> {
  input: GetItemCommandInput;
  mapper: (item: Record<string, AttributeValue> | undefined) => T;
}

export interface BatchGetOps<T> {
  input: BatchGetItemCommandInput;
  mapper: (item: Record<string, Record<string, AttributeValue>[]> | undefined) => T;
}

export type BatchWriteOps = { input: BatchWriteItemCommandInput };
export type PutOps = { input: PutItemCommandInput };
export type UpdateOps = { input: UpdateItemCommandInput };
export type DeleteOps = { input: DeleteItemCommandInput };
export type TransactWriteOps = { input: TransactWriteItemsCommandInput };

export async function dynamoDBGet<T>(ops: GetOps<T>): Promise<DynamoDBResponse<T>> {
  const out = await getClient().send(new GetItemCommand(ops.input));
  if (out.$metadata.attempts == undefined) {
    console.error("The number of retry attempts is undefined!");
  } else if (out.$metadata.attempts > 5) {
    console.warn("More than 5 attempts (" + out.$metadata.attempts + ") were made in this DynamoDB update request. Please check the DynamoDB table for hot partition issues.");
  }
  return {
    data: ops.mapper(out.Item),
    status: out.$metadata.httpStatusCode ?? 500,
    message: out.$metadata.httpStatusCode == 200 ? "Get request successful" : "An error occurred while processing get request"
  };
}

export async function dynamoDBBatchGet<T>(ops: BatchGetOps<T>, unprocessedKeys?: string): Promise<DynamoDBResponse<T>> {
  const duk = unprocessedKeys ? decodeUnprocessedKeys(unprocessedKeys) : null;
  const out = await getClient().send(new BatchGetItemCommand(duk ? { RequestItems: duk } : ops.input));
  const uek = out.UnprocessedKeys ? encodeKey(out.UnprocessedKeys) : null;
  if (out.$metadata.attempts == undefined) {
    console.error("The number of retry attempts is undefined!");
  } else if (out.$metadata.attempts > 5) {
    console.warn("More than 5 attempts (" + out.$metadata.attempts + ") were made in this DynamoDB update request. Please check the DynamoDB table for hot partition issues.");
  }
  return {
    data: ops.mapper(out.Responses),
    status: out.$metadata.httpStatusCode ?? 500,
    message: out.$metadata.httpStatusCode == 200 ? "Batch get request successful" : "An error occurred while processing batch get request",
    ...(uek && { unprocessedKeys: uek }),
  };
}

export async function dynamoDBQuery<T>(ops: QueryOps<T>, limit?: number, scanIndexForward?: boolean, lastEvaluatedKey?: string): Promise<DynamoDBResponse<T>> {
  const exStartKey = lastEvaluatedKey ? decodeLastEvaluatedKey(lastEvaluatedKey) : null;
  const out = await getClient().send(new QueryCommand({ ...ops.input, ScanIndexForward: scanIndexForward, Limit: limit, ...(exStartKey && { ExclusiveStartKey: exStartKey }) }));
  const lek = out.LastEvaluatedKey ? encodeKey(out.LastEvaluatedKey) : null;
  if (out.$metadata.attempts == undefined) {
    console.error("The number of retry attempts is undefined!");
  } else if (out.$metadata.attempts > 5) {
    console.warn("More than 5 attempts (" + out.$metadata.attempts + ") were made in this DynamoDB update request. Please check the DynamoDB table for hot partition issues.");
  }
  return {
    data: ops.mapper(out.Items),
    status: out.$metadata.httpStatusCode ?? 500,
    message: out.$metadata.httpStatusCode == 200 ? "Query request successful" : "An error occurred while processing query request",
    ...(lek && { lastEvaluatedKey: lek })
  };
}

export async function dynamoDBQuerySharded<T>(ops: QueryOpsSharded<T>, targetLimit?: number, scanIndexForward: boolean = true, lastEvaluatedKeys?: string): Promise<DynamoDBShardedQueryResponse<T[]>> {
  const shardNumbers = ops.input.length;
  const parsedLastEvaluatedKeys: Record<number, Record<string, AttributeValue>> | null = decodeShardedLastEvaluatedKey(lastEvaluatedKeys);
  const eachShardLimit = (targetLimit && shardNumbers > 0) ? Math.ceil(targetLimit / shardNumbers) : undefined;
  try {
    const outSharded = await Promise.all(ops.input.map(async (es) => ({ shardNo: es.shardNo, result: await getClient().send(new QueryCommand({ ...es.input, ScanIndexForward: scanIndexForward, Limit: eachShardLimit, ExclusiveStartKey: parsedLastEvaluatedKeys ? parsedLastEvaluatedKeys[es.shardNo] ?? undefined : undefined })) })));
    let boundaryKey: Record<string, AttributeValue> | null = null;
    let boundaryShardNo: number | null = null;
    const failedShards: Map<number, number> = new Map<number, number>();
    outSharded.forEach(x => {
      if (x.result.$metadata.attempts == undefined) {
        console.error("The number of retry attempts is undefined!");
      } else if (x.result.$metadata.attempts > 5) {
        console.warn("More than 5 attempts (" + x.result.$metadata.attempts + ") were made in this DynamoDB put request. Please check the DynamoDB table for hot partition issues.");
      }
      if (x.result.$metadata.httpStatusCode != 200) {
        failedShards.set(x.shardNo, x.result.$metadata.httpStatusCode ?? 500);
        return;
      }
      if (x.result.LastEvaluatedKey) {
        if (!boundaryKey) {
          boundaryKey = x.result.LastEvaluatedKey;
          boundaryShardNo = x.shardNo;
        } else {
          const cmp = ops.itemKeyComparator(x.result.LastEvaluatedKey, boundaryKey);
          if (scanIndexForward) {
            if (cmp < 0) {
              boundaryKey = x.result.LastEvaluatedKey;
              boundaryShardNo = x.shardNo;
            }
          } else {
            if (cmp > 0) {
              boundaryShardNo = x.shardNo;
              boundaryKey = x.result.LastEvaluatedKey;
            }
          }
        }
      }
    });
    const resultLastEvaluatedKeys: Record<number, Record<string, AttributeValue>> = {}
    const resultItems: Record<string, AttributeValue>[] = []
    const preserveLastEvaluatedKeyForShard = (sn: number) => {
      const k = parsedLastEvaluatedKeys?.[sn];
      if (k) resultLastEvaluatedKeys[sn] = k;
    }
    outSharded.forEach(shard => {
      if (failedShards.get(shard.shardNo) != null) {
        // A failed shard makes the whole page inconsistent; all advancement is
        // discarded in the Option-A return below, so nothing to preserve here.
        return;
      }
      if (!boundaryKey) {
        resultItems.push(...shard.result.Items ?? []);
      } else {
        if (boundaryShardNo === shard.shardNo) {
          resultItems.push(...shard.result.Items ?? []);
          if (boundaryKey) resultLastEvaluatedKeys[shard.shardNo] = boundaryKey;
        } else {
          const bk = boundaryKey;
          if (!shard.result.Items || shard.result.Items.length == 0) {
            preserveLastEvaluatedKeyForShard(shard.shardNo);
            return;
          }
          const firstIndexToExclude = shard.result.Items.findIndex((x => scanIndexForward ? ops.itemKeyComparator(x, bk) > 0 : ops.itemKeyComparator(x, bk) < 0))
          const itemsSliced = firstIndexToExclude < 0 ? shard.result.Items : shard.result.Items.slice(0, firstIndexToExclude);
          if (itemsSliced.length < 1) {
            // Every item this shard returned sits beyond the boundary. Nothing is
            // surfaced from it this page, so hold its previous position (if any)
            // rather than rewinding it to the start on the next page.
            preserveLastEvaluatedKeyForShard(shard.shardNo);
            return;
          }
          // Always emit a resume token from the last kept item — even when this
          // shard is already exhausted (no LastEvaluatedKey). The cursor is
          // stateless, so an omitted shard is indistinguishable from one that
          // never started: the next page would re-scan it from the beginning and
          // re-emit these same items as duplicates. Resuming past the last item
          // instead simply yields an empty result next page, terminating cleanly.
          const lastItem = itemsSliced[itemsSliced.length - 1]
          if (!lastItem) return;
          resultLastEvaluatedKeys[shard.shardNo] = ops.keyExtractor(lastItem);
          resultItems.push(...itemsSliced)
        }
      }
    })
    const itemsResolved = ops.mapper(resultItems.sort((a, b) => scanIndexForward ? ops.itemKeyComparator(a, b) : ops.itemKeyComparator(a, b) * -1));
    if (failedShards.size > 0) {
      // One or more shards failed, so this page can't be trusted:
      // the successful shards may have advanced past the failed shards' unknown
      // positions, which would skip items. Instead of persisting that advance,
      // hand back the SAME pagination keys we were called with so the caller
      // re-fetches this exact page once the transient failure clears. The items
      // are returned best-effort (partial) for display only; status 207 signals
      // the caller should treat the page as incomplete and retry.
      const carriedKeys = parsedLastEvaluatedKeys ? (Object.keys(parsedLastEvaluatedKeys).length > 0 ? encodeKey(parsedLastEvaluatedKeys) : null) : null;
      return {
        status: 207,
        message: `Some shards failed to be queried : ${Array.from(failedShards.entries()).map((fe) => `[Shard ${fe[0]} : ${fe[1]}]`).join(", ")}`,
        data: itemsResolved,
        ...(carriedKeys && { lastEvaluatedKey: carriedKeys }),
      }
    }
    const resultLastEvaluatedKeysEncoded = resultLastEvaluatedKeys ? (Object.keys(resultLastEvaluatedKeys).length > 0 ? encodeKey(resultLastEvaluatedKeys) : null) : null;
    return {
      status: 200,
      message: "Query successful",
      data: itemsResolved,
      ...(resultLastEvaluatedKeysEncoded && { lastEvaluatedKey: resultLastEvaluatedKeysEncoded }),
    }
  } catch (err) {
    return { status: 500, message: `An error occurred while processing the sharded query: ${err}`, data: [] }
  }
}

export async function dynamoDBPut(ops: PutOps): Promise<DynamoDBResponse<string>> {
  const res = await getClient().send(new PutItemCommand(ops.input));
  if (res.$metadata.attempts == undefined) {
    console.error("The number of retry attempts is undefined!");
  } else if (res.$metadata.attempts > 5) {
    console.warn("More than 5 attempts (" + res.$metadata.attempts + ") were made in this DynamoDB put request. Please check the DynamoDB table for hot partition issues.");
  }
  return { status: res.$metadata.httpStatusCode ?? 500, message: res.$metadata.httpStatusCode == 200 ? "PUT request successful" : "An error occurred while processing put request", data: res.$metadata.requestId ?? "Unknown Request ID" }
}

export async function dynamoDBUpdate(ops: UpdateOps): Promise<DynamoDBResponse<string>> {
  const res = await getClient().send(new UpdateItemCommand(ops.input));
  if (res.$metadata.attempts == undefined) {
    console.error("The number of retry attempts is undefined!");
  } else if (res.$metadata.attempts > 5) {
    console.warn("More than 5 attempts (" + res.$metadata.attempts + ") were made in this DynamoDB update request. Please check the DynamoDB table for hot partition issues.");
  }
  return { status: res.$metadata.httpStatusCode ?? 500, message: res.$metadata.httpStatusCode == 200 ? "Update request successful" : "An error occurred while processing update request", data: res.$metadata.requestId ?? "Unknown Request ID" }
}

export async function dynamoDBDelete(ops: DeleteOps): Promise<DynamoDBResponse<string>> {
  const res = await getClient().send(new DeleteItemCommand(ops.input));
  if (res.$metadata.attempts == undefined) {
    console.error("The number of retry attempts is undefined!");
  } else if (res.$metadata.attempts > 5) {
    console.warn("More than 5 attempts (" + res.$metadata.attempts + ") were made in this DynamoDB delete request. Please check the DynamoDB table for hot partition issues.");
  }
  return { status: res.$metadata.httpStatusCode ?? 500, message: res.$metadata.httpStatusCode == 200 ? "Delete request successful" : "An error occurred while processing delete request", data: res.$metadata.requestId ?? "Unknown Request ID" }
}

export async function dynamoDBBatchWrite(ops: BatchWriteOps): Promise<DynamoDBResponse<string>> {
  const res = await getClient().send(new BatchWriteItemCommand(ops.input));
  if (res.$metadata.attempts == undefined) {
    console.error("The number of retry attempts is undefined!");
  } else if (res.$metadata.attempts > 5) {
    console.warn("More than 5 attempts (" + res.$metadata.attempts + ") were made in this DynamoDB transact write request. Please check the DynamoDB table for hot partition issues.");
  }
  return { status: res.$metadata.httpStatusCode ?? 500, message: res.$metadata.httpStatusCode == 200 ? "Transact Write request successful" : "An error occurred while processing transact write request", data: res.$metadata.requestId ?? "Unknown Request ID" }
}


export async function dynamoDBTransactWrite(ops: TransactWriteOps): Promise<DynamoDBResponse<string>> {
  const res = await getClient().send(new TransactWriteItemsCommand(ops.input));
  if (res.$metadata.attempts == undefined) {
    console.error("The number of retry attempts is undefined!");
  } else if (res.$metadata.attempts > 5) {
    console.warn("More than 5 attempts (" + res.$metadata.attempts + ") were made in this DynamoDB transact write request. Please check the DynamoDB table for hot partition issues.");
  }
  return { status: res.$metadata.httpStatusCode ?? 500, message: res.$metadata.httpStatusCode == 200 ? "Transact Write request successful" : "An error occurred while processing transact write request", data: res.$metadata.requestId ?? "Unknown Request ID" }
}

/** Test-only: drop the cached client. */
export function _resetClient(): void {
  dynamoDBClient = null;
}