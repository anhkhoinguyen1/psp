#include "arduino_protocol.h"
#include <string.h>

#define PACKET_START_MARKER 0xAA
#define PACKET_END_MARKER 0x55

uint16_t protocol_compute_checksum(uint8_t *data, uint16_t length) {
    uint16_t checksum = 0;
    for (uint16_t i = 0; i < length; i++) {
        checksum += data[i];
    }
    return checksum;
}

bool protocol_send_packet(PacketType_t type, void *payload, uint16_t length) {
    PacketHeader_t header;
    header.start_marker = PACKET_START_MARKER;
    header.packet_type = type;
    header.payload_length = length;
    header.checksum = protocol_compute_checksum((uint8_t*)payload, length);
    
    // Send header
    // UART_Send(&header, sizeof(header));
    
    // Send payload
    // UART_Send(payload, length);
    
    // Send end marker
    uint8_t end = PACKET_END_MARKER;
    // UART_Send(&end, 1);
    
    return true;
}

bool protocol_receive_packet(PacketType_t *type, void *payload, uint16_t max_length) {
    PacketHeader_t header;
    
    // Receive header
    // UART_Receive(&header, sizeof(header));
    
    if (header.start_marker != PACKET_START_MARKER) {
        return false;
    }
    
    if (header.payload_length > max_length) {
        return false;
    }
    
    // Receive payload
    // UART_Receive(payload, header.payload_length);
    
    // Verify checksum
    uint16_t computed_checksum = protocol_compute_checksum((uint8_t*)payload, 
                                                           header.payload_length);
    if (computed_checksum != header.checksum) {
        return false;
    }
    
    *type = (PacketType_t)header.packet_type;
    return true;
}
