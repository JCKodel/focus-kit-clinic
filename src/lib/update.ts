export type Update<S> = (current: S) => S;
export type Started<S> = { update: Update<S>; send: boolean };
