/** Why a renderer gave up. `unsupported` is unrecoverable, so it must not offer a retry. */
export type MapFailureReason = 'unreachable' | 'unsupported';
