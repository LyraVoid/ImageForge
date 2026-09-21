#include <errno.h>
#include <fcntl.h>
#include <string.h>
#include <unistd.h>

int mkstemp(char *tmpl)
{
    static unsigned counter = 0;
    const char *alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    size_t len = strlen(tmpl);
    if (len < 6) return -1;
    char *suffix = tmpl + len - 6;
    for (unsigned attempt = 0; attempt < 4096; attempt++) {
        unsigned value = (counter++ * 2654435761u) + attempt * 2246822519u;
        for (int i = 0; i < 6; i++) {
            suffix[i] = alphabet[value % 36];
            value /= 36;
        }
        int fd = open(tmpl, O_CREAT | O_EXCL | O_RDWR, 0600);
        if (fd >= 0) return fd;
    }
    return -1;
}

/* No process spawning inside WebAssembly: fail closed so upstream error
 * handling takes over instead of crashing. */
int system(const char *command)
{
    (void)command;
    errno = ENOSYS;
    return -1;
}
