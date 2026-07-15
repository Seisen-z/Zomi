package uy.kohesive.injekt.api

// Vendored from https://github.com/inorichi/injekt (core/api modules) — the real Maven/JitPack
// artifact `com.github.inorichi.injekt:injekt-core` is marked private on JitPack and won't
// resolve, but the GitHub source is public, so it's copied here verbatim instead of reimplemented.
class InjektionException(msg: String) : RuntimeException(msg)
