#include "fft_benchmark.h"
#include <stdio.h>
#include <stdlib.h>

// Platform-specific timing (example for ARM Cortex-M)
#ifdef STM32F4
#include "stm32f4xx_hal.h"
static inline uint32_t get_time_us(void) {
    return HAL_GetTick() * 1000;
}
#else
#include <time.h>
static inline uint32_t get_time_us(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000000 + ts.tv_nsec / 1000;
}
#endif

void benchmark_all_algorithms(uint16_t size, BenchmarkResult_t *results) {
    // Generate test signal
    Complex_t *test_data = (Complex_t*)malloc(size * sizeof(Complex_t));
    Complex_t *backup = (Complex_t*)malloc(size * sizeof(Complex_t));
    
    for (uint16_t i = 0; i < size; i++) {
        test_data[i].real = sinf(2 * PI * 5 * i / size) + 
                           0.5f * sinf(2 * PI * 15 * i / size);
        test_data[i].imag = 0.0f;
    }
    
    uint8_t idx = 0;
    
    // Benchmark Radix-2
    memcpy(backup, test_data, size * sizeof(Complex_t));
    uint32_t start = get_time_us();
    fft_cooley_tukey(backup, size, false);
    uint32_t end = get_time_us();
    
    results[idx].algorithm = FFT_RADIX2;
    results[idx].size = size;
    results[idx].execution_time_us = end - start;
    results[idx].memory_used_bytes = size * sizeof(Complex_t);
    idx++;
    
    // Benchmark Radix-4 (if size is power of 4)
    uint16_t temp = size;
    bool is_power_of_4 = true;
    while (temp > 1) {
        if (temp % 4 != 0) {
            is_power_of_4 = false;
            break;
        }
        temp /= 4;
    }
    
    if (is_power_of_4) {
        memcpy(backup, test_data, size * sizeof(Complex_t));
        start = get_time_us();
        fft_radix4(backup, size, false);
        end = get_time_us();
        
        results[idx].algorithm = FFT_RADIX4;
        results[idx].size = size;
        results[idx].execution_time_us = end - start;
        results[idx].memory_used_bytes = size * sizeof(Complex_t);
        idx++;
    }
    
    // Benchmark Split-Radix
    memcpy(backup, test_data, size * sizeof(Complex_t));
    start = get_time_us();
    fft_split_radix(backup, size, false);
    end = get_time_us();
    
    results[idx].algorithm = FFT_SPLIT_RADIX;
    results[idx].size = size;
    results[idx].execution_time_us = end - start;
    results[idx].memory_used_bytes = size * sizeof(Complex_t);
    
    free(test_data);
    free(backup);
}

void benchmark_print_results(BenchmarkResult_t *results, uint8_t count) {
    printf("\n=== FFT Benchmark Results ===\n");
    printf("%-15s %-10s %-15s %-15s\n", 
           "Algorithm", "Size", "Time (us)", "Memory (bytes)");
    printf("----------------------------------------------------------\n");
    
    for (uint8_t i = 0; i < count; i++) {
        const char *algo_name;
        switch (results[i].algorithm) {
            case FFT_RADIX2: algo_name = "Radix-2"; break;
            case FFT_RADIX4: algo_name = "Radix-4"; break;
            case FFT_SPLIT_RADIX: algo_name = "Split-Radix"; break;
            default: algo_name = "Unknown"; break;
        }
        
        printf("%-15s %-10u %-15lu %-15lu\n",
               algo_name,
               results[i].size,
               (unsigned long)results[i].execution_time_us,
               (unsigned long)results[i].memory_used_bytes);
    }
}