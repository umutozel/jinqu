import deepEqual = require('deep-equal');
import { IQueryProvider, IPartArgument, IQueryPart } from './types';
import { QueryFunc } from './query-part';
import { Query } from './queryable';

const thenFuncs = [QueryFunc.thenBy, QueryFunc.thenByDescending];
const descFuncs = [QueryFunc.orderByDescending, QueryFunc.thenByDescending];

export class ArrayQueryProvider implements IQueryProvider {

    constructor(private readonly items: any[]) {
    }

    createQuery<T>(parts?: IQueryPart[]): Query<T> {
        return new Query<T>(this, parts);
    }

    execute<TResult = any>(parts: IQueryPart[]): TResult {
        return execute(this.items, parts);
    }
}

export function execute(items: any[], parts: IQueryPart[]) {
    if (!parts || !parts.length) return items;

    check(items);

    let value: any = items;
    let orderParts = [];
    for (let p of parts) {
        if (~thenFuncs.indexOf(p.type)) {
            orderParts.push(p);
        }
        else {
            if (orderParts.length) {
                value = orderBy(items, orderParts);
                orderParts = [];
            }

            value = handlePart(value, p);
        }
    }
    return value;
}

function handlePart(items: any[], part: IQueryPart) {
    const f = funcs[part.type];
    if (!f) throw new Error(`Unknown query part type ${part.type}.`);

    return f.call(null, items, ...part.args);
}

const funcs = {
    where,
    ofType,
    cast,
    select,
    selectMany,
    joinWith,
    groupJoin,
    take,
    takeWhile,
    skip,
    skipWhile,
    groupBy,
    distinct,
    concatWith,
    zip,
    union,
    intersect,
    except,
    defaultIfEmpty,
    reverse,

    first,
    firstOrDefault,
    last,
    lastOrDefault,
    single,
    singleOrDefault,
    elementAt,
    elementAtOrDefault,
    contains,
    sequenceEqual,
    any,
    all,
    count,
    min,
    max,
    sum,
    average,
    aggregate
}

function* where(items: any[], predicate: IPartArgument) {
    for (let i of items) {
        if (predicate.func(i)) yield i;
    }
}

function* ofType(items: any[], ctor: IPartArgument) {
    for (let i of items) {
        if (i !== Object(i)) {
            if (ctor.literal(i) === i)
                yield i;
        } else if (i instanceof ctor.literal)
            yield i;
    }
}

function* cast(items: any[], ctor: IPartArgument) {
    for (let i of items) {
        if (i !== Object(i)) {
            const v = ctor.literal(i);
            if (v === NaN || v === null)
                throw new Error(`Unable to cast ${i}`);
            
            yield v;
        } else {
            if (i.constructor !== Object && !(i instanceof ctor.literal))
                throw new Error(`Unable to cast ${i}`);

            yield i;
        }
    }
}

function* select(items: any[], selector: IPartArgument) {
    for (let i of items)
        yield selector.func(i);
}

function* selectMany(items: any[], selector: IPartArgument) {
    for (let i of items) {
        for (let ii of selector.func(i))
            yield ii;
    }
}

function* joinWith(items: any[], other: IPartArgument, thisKey: IPartArgument, otherKey: IPartArgument, selector: IPartArgument) {
    const os = getArray(other);

    for (let i of items) {
        var k = thisKey.func(i);
        for (let o of os) {
            if (deepEqual(otherKey.func(o), k))
                yield selector.func(i, o);
        }
    }
}

function* groupJoin(items: any[], other: IPartArgument, thisKey: IPartArgument, otherKey: IPartArgument, selector: IPartArgument) {
    const os = getArray(other);

    for (let i of items) {
        var k = thisKey.func(i);
        yield selector.func(i, os.filter(o => deepEqual(otherKey.func(o), k)));
    }
}

function orderBy(items: any[], keySelectors: IQueryPart[]) {
    return items.slice().sort((i1, i2) => {
        for (let s of keySelectors) {
            const desc = descFuncs.indexOf(s.type) ? -1 : 1;
            const sel = s.args[0];
            const v1 = sel.func(i1);
            const v2 = sel.func(i2);

            if (v1 > v2) return desc;
            if (v1 < v2) return -1 * desc;
        }
    });
}

function* take(items: any[], count: IPartArgument) {
    let i = 0;
    for (let item of items) {
        if (++i <= count.literal)
            yield item;
        else break;
    }
}

function* takeWhile(items: any[], predicate: IPartArgument) {
    for (let i of items) {
        if (predicate.func(i))
            yield i;
        else break;
    }
}

function* skip(items: any[], count: IPartArgument) {
    let i = 0;
    for (let item of items) {
        if (++i > count.literal)
            yield item;
    }
}

function* skipWhile(items: any[], predicate: IPartArgument) {
    for (let i of items) {
        if (predicate.func(i))
            break;
        else yield i;
    }
}

function* groupBy(items: any[], keySelector: IPartArgument, valueSelector: IPartArgument) {
    const groups = [];
    for (let i of items) {
        const k = keySelector.func(i);
        const a = groups.find(g => deepEqual(g.key, k));
        if (!a) {
            const group = [];
            group['key'] = k;
            groups.push(group);
        }
        else {
            a.push(i);
        }
    }

    for (let g of groups)
        yield valueSelector.func(g);
}

function* distinct(items: any[], comparer: IPartArgument) {
    const r = [];
    for (let i = 0; i < items.length; i++) {
        const i1 = items[i];
        let j = i
        for (; j < items.length; j++) {
            const i2 = items[j];
            if (comparer.func ? comparer.func(i1, i2) : (i1 == i2)) break;
        }

        if (j === items.length)
            yield i1;
    }

    return r;
}

function* concatWith(items: any[], other: IPartArgument) {
    const os = getArray(other);

    for (let i of items)
        yield i;

    for (let o of os)
        yield o;
}

function* zip(items: any[], other: IPartArgument, selector: IPartArgument) {
    const os = getArray(other);

    var l = Math.min(items.length, os.length);
    for (var i = 0; i < l; i++)
        yield selector.func(items[i], other[i]);
}

function* union(items: any[], other: IPartArgument) {
    const s = new Set();

    for (let i of items) {
        if (!s.has(i)) {
            s.add(i);
            yield i;
        }
    }

    const os = getArray(other);
    for (let o of os) {
        if (!s.has(o)) {
            s.add(o);
            yield o;
        }
    }
}

function* intersect(items: any[], other: IPartArgument) {
    const os = new Set(getArray(other));

    const s = new Set();
    for (let i of items) {
        if (os.has(i) && !s.has(i)) {
            s.add(i);
            yield i;
        }
    }
}

function* except(items: any[], other: IPartArgument) {
    const os = new Set(getArray(other));

    const s = new Set();
    for (let i of items) {
        if (!os.has(i) && !s.has(i)) {
            s.add(i);
            yield i;
        }
    }
}

function defaultIfEmpty(items: any[]) {
    return items || [];
}

function* reverse(items: any[]) {
    for (let i = items.length; i >= 0; i--)
        yield items[i];
}

function first(items: any[], predicate: IPartArgument) {
    if (!items.length) throw new Error('Sequence contains no element')

    const [found, item] = getFirst(items, predicate);

    if (!found) throw new Error('Sequence contains no matching element');

    return item;
}

function firstOrDefault(items: any[], predicate: IPartArgument) {
    return getFirst(items, predicate)[1];
}

function getFirst(items: any[], predicate: IPartArgument) {
    for (let i of items) {
        if (!predicate.func || predicate.func(i)) return [true, i];
    }

    return [false, null]
}

function last(items: any[], predicate: IPartArgument) {
    if (!items.length) throw new Error('Sequence contains no element');

    const [found, item] = getLast(items, predicate);

    if (!found) throw new Error('Sequence contains no matching element');

    return item;
}

function lastOrDefault(items: any[], predicate: IPartArgument) {
    return getLast(items, predicate)[1];
}

function getLast(items: any[], predicate: IPartArgument) {
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (!predicate.func || predicate.func(item)) return [true, item];
    }

    return [false, null];
}

function single(items: any[], predicate: IPartArgument) {
    if (!items.length) throw new Error('Sequence contains no element');

    const [found, item] = getSingle(items, predicate);

    if (!found) throw new Error('Sequence contains no matching element');

    return item;
}

function singleOrDefault(items: any[], predicate: IPartArgument) {
    return getSingle(items, predicate)[1];
}

function getSingle(items: any[], predicate: IPartArgument) {
    let matches = [];
    for (let item of items) {
        if (predicate.func && !predicate.func(item)) continue;

        if (matches.length > 0)
            throw new Error('Sequence contains more than one matching element');

        matches.push(item);
    }

    return matches.length ? [true, matches[0]] : [false, null];
}

function elementAt(items: any[], index: IPartArgument) {
    if (index.literal > items.length)
        throw new Error('Index was outside the bounds of the array.');

    return items[index.literal];
}

function elementAtOrDefault(items: any[], index: IPartArgument) {
    return items[index.literal];
}

function contains(items: any[], item: IPartArgument) {
    return items.indexOf(item) >= 0;
}

function sequenceEqual(items: any[], other: IPartArgument) {
    const o = other.literal;
    if (!o || items.length !== o.length) return false;

    for (let i = 0; i < items.length; i++) {
        if (items[i] != o[i]) return false;
    }

    return true;
}

function any(items: any[], predicate: IPartArgument) {
    return predicate.func ? items.some(<any>predicate.func) : items.length > 0;
}

function all(items: any[], predicate: IPartArgument) {
    return items.every(<any>predicate.func);
}

function count(items: any[], predicate: IPartArgument) {
    return predicate.func ? items.filter(<any>predicate.func).length : items.length;
}

function min(items: any[], selector: IPartArgument) {
    return Math.min(selector.func ? <any>items.map(<any>selector.func) : items);
}

function max(items: any[], selector: IPartArgument) {
    return Math.max(selector.func ? <any>items.map(<any>selector.func) : items);
}

function sum(items: any[], selector: IPartArgument) {
    return items.reduce((p, c) => p + (selector.func ? selector.func(c) : c), 0);
}

function average(items: any[], selector: IPartArgument) {
    return items.length ? sum(items, selector) / items.length : 0;
}

function aggregate(items: any[], func: IPartArgument, seed: IPartArgument, selector: IPartArgument) {
    return items.reduce(
        (p, c) => func.func(p, selector.func ? selector.func(c) : c),
        seed.literal
    );
}

function check(items) {
    if (!items) throw new TypeError('Cannot query null array.');
}

function getArray(arg: IPartArgument) {
    return (arg.func ? arg.func() : arg.literal) as any[];
}
