#ifndef DATA_LOGGER_H
#define DATA_LOGGER_H

#include <stdint.h>
#include <stdbool.h>

#define LOG_BUFFER_SIZE 1024

typedef enum {
    LOG_LEVEL_DEBUG,
    LOG_LEVEL_INFO,
    LOG_LEVEL_WARNING,
    LOG_LEVEL_ERROR
} LogLevel_t;

typedef struct {
    uint32_t timestamp;
    LogLevel_t level;
    char message[128];
} LogEntry_t;

void logger_init(void);
void logger_log(LogLevel_t level, const char *format, ...);
// void logger_log_fft_result(Complex_t *data, uint16_t size);
void logger_flush(void);
bool logger_save_to_file(const char *filename);

#endif // DATA_LOGGER_H