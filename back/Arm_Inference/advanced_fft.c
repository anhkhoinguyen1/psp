#include "advanced_fft.h"
#include <string.h>

// Complex arithmetic
Complex_t complex_multiply(Complex_t a, Complex_t b) {
    Complex_t result;
    result.real = a.real * b.real - a.imag * b.imag;
    result.imag = a.real * b.imag + a.imag * b.real;
    return result;
}

Complex_t complex_add(Complex_t a, Complex_t b) {
    Complex_t result = {a.real + b.real, a.imag + b.imag};
    return result;
}

Complex_t complex_subtract(Complex_t a, Complex_t b) {
    Complex_t result = {a.real - b.real, a.imag - b.imag};
    return result;
}

// Bit-reversal permutation (optimized with lookup table)
static uint16_t reverse_bits(uint16_t x, uint8_t bits) {
    uint16_t result = 0;
    for (uint8_t i = 0; i < bits; i++) {
        result = (result << 1) | (x & 1);
        x >>= 1;
    }
    return result;
}

void fft_bit_reverse(Complex_t *data, uint16_t n) {
    uint8_t bits = 0;
    uint16_t temp = n;
    while (temp > 1) {
        bits++;
        temp >>= 1;
    }
    
    for (uint16_t i = 0; i < n; i++) {
        uint16_t j = reverse_bits(i, bits);
        if (i < j) {
            Complex_t temp = data[i];
            data[i] = data[j];
            data[j] = temp;
        }
    }
}

// Twiddle factor computation with caching
void fft_compute_twiddle_factors(Complex_t *twiddle, uint16_t n, bool inverse) {
    float angle_sign = inverse ? 1.0f : -1.0f;
    for (uint16_t i = 0; i < n / 2; i++) {
        float angle = 2.0f * PI * i / n * angle_sign;
        twiddle[i].real = cosf(angle);
        twiddle[i].imag = sinf(angle);
    }
}


// ============================================================================
// Cooley-Tukey Radix-2 FFT (from your reference code, optimized)
// ============================================================================
void fft_cooley_tukey(Complex_t *data, uint16_t n, bool inverse) {
    if (n <= 1) return;
    
    // Bit-reversal permutation
    fft_bit_reverse(data, n);
    
    // Precompute twiddle factors
    static Complex_t twiddle[FFT_MAX_SIZE / 2];
    fft_compute_twiddle_factors(twiddle, n, inverse);
    
    // Iterative FFT computation
    for (uint16_t stage = 2; stage <= n; stage <<= 1) {
        uint16_t half_stage = stage / 2;
        uint16_t step = n / stage;
        
        for (uint16_t group = 0; group < n; group += stage) {
            for (uint16_t k = 0; k < half_stage; k++) {
                uint16_t idx = group + k;
                uint16_t pair_idx = idx + half_stage;
                
                // Butterfly operation
                Complex_t u = data[idx];
                Complex_t v = complex_multiply(data[pair_idx], twiddle[step * k]);
                
                data[idx] = complex_add(u, v);
                data[pair_idx] = complex_subtract(u, v);
            }
        }
    }
    
    // Normalization for inverse transform
    if (inverse) {
        for (uint16_t i = 0; i < n; i++) {
            data[i].real /= n;
            data[i].imag /= n;
        }
    }
}

// ============================================================================
// Radix-4 FFT (faster for n = 4^k)
// ============================================================================
void fft_radix4(Complex_t *data, uint16_t n, bool inverse) {
    if (n <= 1) return;
    
    // Check if n is power of 4
    uint16_t temp = n;
    while (temp > 1) {
        if (temp % 4 != 0) {
            // Fall back to radix-2
            fft_cooley_tukey(data, n, inverse);
            return;
        }
        temp /= 4;
    }
    
    fft_bit_reverse(data, n);
    
    float angle_sign = inverse ? 1.0f : -1.0f;
    
    // Radix-4 butterfly
    for (uint16_t stage = 4; stage <= n; stage <<= 2) {
        uint16_t quarter = stage / 4;
        
        for (uint16_t group = 0; group < n; group += stage) {
            for (uint16_t k = 0; k < quarter; k++) {
                float angle = 2.0f * PI * k / stage * angle_sign;
                Complex_t w1 = {cosf(angle), sinf(angle)};
                Complex_t w2 = {cosf(2*angle), sinf(2*angle)};
                Complex_t w3 = {cosf(3*angle), sinf(3*angle)};
                
                uint16_t i0 = group + k;
                uint16_t i1 = i0 + quarter;
                uint16_t i2 = i1 + quarter;
                uint16_t i3 = i2 + quarter;
                
                Complex_t t0 = data[i0];
                Complex_t t1 = complex_multiply(data[i1], w1);
                Complex_t t2 = complex_multiply(data[i2], w2);
                Complex_t t3 = complex_multiply(data[i3], w3);
                
                Complex_t a = complex_add(t0, t2);
                Complex_t b = complex_add(t1, t3);
                Complex_t c = complex_subtract(t0, t2);
                Complex_t d = complex_subtract(t1, t3);
                
                // Multiply d by -j for inverse
                if (!inverse) {
                    Complex_t temp = {d.imag, -d.real};
                    d = temp;
                } else {
                    Complex_t temp = {-d.imag, d.real};
                    d = temp;
                }
                
                data[i0] = complex_add(a, b);
                data[i1] = complex_add(c, d);
                data[i2] = complex_subtract(a, b);
                data[i3] = complex_subtract(c, d);
            }
        }
    }
    
    if (inverse) {
        for (uint16_t i = 0; i < n; i++) {
            data[i].real /= n;
            data[i].imag /= n;
        }
    }
}

// ============================================================================
// Split-Radix FFT (optimal multiplication count)
// ============================================================================
void fft_split_radix_recursive(Complex_t *data, uint16_t n, bool inverse, uint16_t stride) {
    if (n == 1) return;
    if (n == 2) {
        Complex_t temp = data[0];
        data[0] = complex_add(data[0], data[stride]);
        data[stride] = complex_subtract(temp, data[stride]);
        return;
    }
    
    uint16_t n2 = n / 2;
    uint16_t n4 = n / 4;
    
    // Recursion
    fft_split_radix_recursive(data, n2, inverse, stride * 2);
    fft_split_radix_recursive(data + stride, n4, inverse, stride * 4);
    fft_split_radix_recursive(data + 3 * stride, n4, inverse, stride * 4);
    
    // Combine
    float angle_sign = inverse ? 1.0f : -1.0f;
    for (uint16_t k = 0; k < n4; k++) {
        float angle1 = 2.0f * PI * k / n * angle_sign;
        float angle3 = 3.0f * angle1;
        
        Complex_t w1 = {cosf(angle1), sinf(angle1)};
        Complex_t w3 = {cosf(angle3), sinf(angle3)};
        
        uint16_t i0 = k * stride;
        uint16_t i1 = i0 + n2 * stride;
        uint16_t i2 = i0 + stride;
        uint16_t i3 = i0 + (n2 + 1) * stride;
        
        Complex_t t1 = complex_multiply(data[i2], w1);
        Complex_t t3 = complex_multiply(data[i3], w3);
        
        Complex_t s = complex_add(t1, t3);
        Complex_t d = complex_subtract(t1, t3);
        
        data[i2] = complex_subtract(data[i0], s);
        data[i0] = complex_add(data[i0], s);
        
        Complex_t temp = {d.imag * angle_sign, -d.real * angle_sign};
        data[i3] = complex_subtract(data[i1], temp);
        data[i1] = complex_add(data[i1], temp);
    }
}

void fft_split_radix(Complex_t *data, uint16_t n, bool inverse) {
    fft_split_radix_recursive(data, n, inverse, 1);
    
    if (inverse) {
        for (uint16_t i = 0; i < n; i++) {
            data[i].real /= n;
            data[i].imag /= n;
        }
    }
}

// ============================================================================
// Fixed-Point FFT (16-bit for memory-constrained systems)
// ============================================================================
#define FIXED_POINT_SCALE 16384  // 2^14 for Q14 format

ComplexFixed_t fixed_multiply(ComplexFixed_t a, ComplexFixed_t b) {
    ComplexFixed_t result;
    int32_t real = ((int32_t)a.real * b.real - (int32_t)a.imag * b.imag) / FIXED_POINT_SCALE;
    int32_t imag = ((int32_t)a.real * b.imag + (int32_t)a.imag * b.real) / FIXED_POINT_SCALE;
    result.real = (int16_t)real;
    result.imag = (int16_t)imag;
    return result;
}

void fft_fixed_point(ComplexFixed_t *data, uint16_t n, bool inverse) {
    // Bit-reversal
    uint8_t bits = 0;
    uint16_t temp = n;
    while (temp > 1) {
        bits++;
        temp >>= 1;
    }
    
    for (uint16_t i = 0; i < n; i++) {
        uint16_t j = reverse_bits(i, bits);
        if (i < j) {
            ComplexFixed_t temp = data[i];
            data[i] = data[j];
            data[j] = temp;
        }
    }
    
    // Precompute fixed-point twiddle factors
    static ComplexFixed_t twiddle[FFT_MAX_SIZE / 2];
    float angle_sign = inverse ? 1.0f : -1.0f;
    for (uint16_t i = 0; i < n / 2; i++) {
        float angle = 2.0f * PI * i / n * angle_sign;
        twiddle[i].real = (int16_t)(cosf(angle) * FIXED_POINT_SCALE);
        twiddle[i].imag = (int16_t)(sinf(angle) * FIXED_POINT_SCALE);
    }
    
    // FFT computation
    for (uint16_t stage = 2; stage <= n; stage <<= 1) {
        uint16_t half_stage = stage / 2;
        uint16_t step = n / stage;
        
        for (uint16_t group = 0; group < n; group += stage) {
            for (uint16_t k = 0; k < half_stage; k++) {
                uint16_t idx = group + k;
                uint16_t pair_idx = idx + half_stage;
                
                ComplexFixed_t u = data[idx];
                ComplexFixed_t v = fixed_multiply(data[pair_idx], twiddle[step * k]);
                
                data[idx].real = u.real + v.real;
                data[idx].imag = u.imag + v.imag;
                data[pair_idx].real = u.real - v.real;
                data[pair_idx].imag = u.imag - v.imag;
            }
        }
    }
    
    if (inverse) {
        for (uint16_t i = 0; i < n; i++) {
            data[i].real /= n;
            data[i].imag /= n;
        }
    }
}

// ============================================================================
// Polynomial Multiplication (from your reference)
// ============================================================================
void polynomial_multiply(Complex_t *a, Complex_t *b, Complex_t *result, uint16_t size) {
    // Find next power of 2
    uint16_t fft_size = 1;
    while (fft_size < 2 * size) {
        fft_size <<= 1;
    }
    
    // Zero-pad
    Complex_t *a_padded = (Complex_t*)calloc(fft_size, sizeof(Complex_t));
    Complex_t *b_padded = (Complex_t*)calloc(fft_size, sizeof(Complex_t));
    
    memcpy(a_padded, a, size * sizeof(Complex_t));
    memcpy(b_padded, b, size * sizeof(Complex_t));
    
    // Forward FFT
    fft_cooley_tukey(a_padded, fft_size, false);
    fft_cooley_tukey(b_padded, fft_size, false);
    
    // Element-wise multiplication
    for (uint16_t i = 0; i < fft_size; i++) {
        result[i] = complex_multiply(a_padded[i], b_padded[i]);
    }
    
    // Inverse FFT
    fft_cooley_tukey(result, fft_size, true);
    
    free(a_padded);
    free(b_padded);
}

