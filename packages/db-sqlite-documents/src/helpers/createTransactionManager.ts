import type { DatabaseSync } from "node:sqlite";

import type {
  BeginTransaction,
  CommitTransaction,
  RollbackTransaction,
} from "payload";

/**
 * Build the `beginTransaction` / `commitTransaction` / `rollbackTransaction`
 * trio for a single SQLite connection.
 *
 * Because every data method runs through the one shared `connection`, an open
 * `BEGIN` on it automatically scopes their writes — so transactions need no
 * per-handler plumbing (handlers never look at `req.transactionID`). The
 * outermost `beginTransaction` issues `BEGIN`; nested ones (Payload finishing
 * them inner-first) open `SAVEPOINT`s, so commit/rollback map to
 * `RELEASE` / `ROLLBACK TO`. `beginTransaction` returns a numeric id Payload
 * threads back to commit/rollback.
 *
 * The single shared connection is a deliberate local-dev tradeoff: SQLite allows
 * only one live transaction per connection, so this does not isolate genuinely
 * concurrent transactions from separate requests — fine for the local/preview
 * target, not a high-concurrency production database.
 */
export const createTransactionManager = ({
  connection,
}: {
  connection: DatabaseSync;
}): {
  beginTransaction: BeginTransaction;
  commitTransaction: CommitTransaction;
  rollbackTransaction: RollbackTransaction;
} => {
  // LIFO stack of open transactions; `savepoint` is null for the outermost
  // (real BEGIN) and a savepoint name for each nested one.
  const stack: { id: number; savepoint: null | string }[] = [];
  const counter = { next: 0 };

  const beginTransaction: BeginTransaction = async () => {
    const id = ++counter.next;

    if (stack.length === 0) {
      connection.exec("BEGIN");
      stack.push({ id, savepoint: null });
    } else {
      const savepoint = `payload_sp_${id}`;
      connection.exec(`SAVEPOINT ${savepoint}`);
      stack.push({ id, savepoint });
    }

    return id;
  };

  const commitTransaction: CommitTransaction = async (id) => {
    // `id` may itself be the begin promise; awaiting normalises both.
    await id;
    const frame = stack.pop();
    if (!frame) return;

    connection.exec(frame.savepoint ? `RELEASE ${frame.savepoint}` : "COMMIT");
  };

  const rollbackTransaction: RollbackTransaction = async (id) => {
    await id;
    const frame = stack.pop();
    if (!frame) return;

    if (frame.savepoint) {
      // Undo to the savepoint, then release it so the name is freed.
      connection.exec(`ROLLBACK TO ${frame.savepoint}`);
      connection.exec(`RELEASE ${frame.savepoint}`);
    } else {
      connection.exec("ROLLBACK");
    }
  };

  return { beginTransaction, commitTransaction, rollbackTransaction };
};
