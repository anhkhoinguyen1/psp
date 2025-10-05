#ifndef ARDUINO_PROTOCOL_H
#define ARDUINO_PROTOCOL_H

#include <stdint.h>
#include <stdbool.h>

// Packet types
typedef enum {
    PKT_SENSOR_DATA = 0x01,
    PKT_FFT_RESULT = 0x02,
    PKT_INFERENCE_RESULT = 0x03,
    PKT_ACK = 0x04,
    PKT_ERROR = 0x05,
    PKT_CONFIG = 0x06
} PacketType_t;

// Packet header
typedef struct __attribute__((packed)) {
    uint8_t start_marker;     // 0xAA
    uint8_t packet_type;
    uint16_t payload_length;
    uint16_t checksum;
} PacketHeader_t;

// Sensor data packet
typedef struct __attribute__((packed)) {
    uint32_t timestamp;
    uint8_t num_sensors;
    float sensor_values[8];
} SensorDataPayload_t;

// FFT result packet
typedef struct __attribute__((packed)) {
    uint8_t sensor_id;
    uint16_t fft_size;
    float peak_frequency;
    float peak_magnitude;
    float spectral_centroid;
} FFTResultPayload_t;

// Protocol functions
bool protocol_send_packet(PacketType_t type, void *payload, uint16_t length);
bool protocol_receive_packet(PacketType_t *type, void *payload, uint16_t max_length);
uint16_t protocol_compute_checksum(uint8_t *data, uint16_t length);
bool protocol_validate_packet(PacketHeader_t *header, uint8_t *payload);

#endif // ARDUINO_PROTOCOL_H
