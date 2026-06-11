# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2026-06-11

### Changed

- Replaced `@thani-sh/iterables` dependency with native Web Streams API (`ReadableStream` / `WritableStream`).
- Server handler signature changed: now receives `ReadableStream<I>` and returns `ReadableStream<O>` instead of `AsyncGenerator`.
- Client `create()` now returns `{ rx: ReadableStream<O>, tx: WritableStream<I> }` instead of `{ stream, call, done, error }`.

### Added

- Polyfill for `ReadableStream[Symbol.asyncIterator]` in `web.ts`

### Removed

- Dependency on `@thani-sh/iterables`.

## [1.0.2] - 2026-06-11

### Changed

- Replaced `createAsyncIterable` helper with `@thani-sh/iterables` library.

## [1.0.1] - 2026-06-11

### Changed

- Migrated project structure to align with the standard JS library template.

## [1.0.0] - 2026-06-11

### Added

- Initial release of SteamBun
