// All local scheduling families share a lock and the active account boundary.
// Revoking the owner synchronously prevents a late network response from rescheduling after logout.
let owner: string | null = null;
let queue: Promise<unknown> = Promise.resolve();
export const MAX_PENDING_LOCAL_NOTIFICATIONS = 60;
export const setNotificationOwner = (userId: string | null) => { owner = userId; };
export const isNotificationOwner = (userId: string) => !!userId && owner === userId;
export const serializeNotifications = <T,>(task: () => Promise<T>): Promise<T> => {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
};
