#ifndef IMAGEFORGE_KPTOOLS_COMPAT_H
#define IMAGEFORGE_KPTOOLS_COMPAT_H
/* wasi-libc does not declare mkstemp and does not provide system().
 * Upstream only reaches both from the Windows-Subsystem-for-Android x86 gzip
 * workaround, which is unreachable for arm64 Android boot images. They are
 * declared here so upstream translation units compile unmodified. */
int mkstemp(char *tmpl);
int system(const char *command);
#endif
