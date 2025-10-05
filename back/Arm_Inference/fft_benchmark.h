#ifndef FFT_BENCHMARK_H
#define FFT_BENCHMARK_H

#include "advanced_fft.h"

typedef struct {
    FFT_Algorithm_t algorithm;
    uint16_t size;
    uint32_t execution_time_us;
    uint32_t memory_used_bytes;
    float accuracy_mse;
} BenchmarkResult_t;

void benchmark_all_algorithms(uint16_t size, BenchmarkResult_t *results);
void benchmark_print_results(BenchmarkResult_t *results, uint8_t count);
float benchmark_compute_accuracy(Complex_t *computed, Complex_t *reference, uint16_t size);

#endif // FFT_BENCHMARK_H
