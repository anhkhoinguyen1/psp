#!/bin/bash
# ===========================================================================
# setup_project.sh - Complete Project Setup Script
# ===========================================================================

echo "╔════════════════════════════════════════╗"
echo "║  ARM Cortex-M4 FFT System Setup       ║"
echo "╚════════════════════════════════════════╝"
echo ""

PROJECT_NAME="arm_fft_system"

# Create directory structure
echo "Creating directory structure..."
mkdir -p $PROJECT_NAME/{src,include,test,build,arduino}

cd $PROJECT_NAME

# ===========================================================================
# Create Makefile
# ===========================================================================
cat > Makefile << 'EOF'
# Makefile for ARM Cortex-M4 FFT System
PROJECT = fft_system
PLATFORM ?= SIMULATOR

# Compiler
ifeq ($(PLATFORM),SIMULATOR)
    CC = gcc
    CFLAGS = -Wall -Wextra -O2 -g -DSIMULATOR
    LDFLAGS = -lm
else
    CC = arm-none-eabi-gcc
    CFLAGS = -mcpu=cortex-m4 -mthumb -mfloat-abi=hard -mfpu=fpv4-sp-d16
    CFLAGS += -Wall -O2 -DSTM32F4
    LDFLAGS = -lm
endif

# Directories
SRC_DIR = src
INC_DIR = include
BUILD_DIR = build
TEST_DIR = test

# Include path
INCLUDES = -I$(INC_DIR)

# Source files
SRCS = $(wildcard $(SRC_DIR)/*.c)
OBJS = $(SRCS:$(SRC_DIR)/%.c=$(BUILD_DIR)/%.o)

# Test files
TEST_SRCS = $(wildcard $(TEST_DIR)/*.c)
TEST_OBJS = $(TEST_SRCS:$(TEST_DIR)/%.c=$(BUILD_DIR)/test_%.o)

.PHONY: all clean test help

all: $(BUILD_DIR)/$(PROJECT)

$(BUILD_DIR):
	@mkdir -p $(BUILD_DIR)

$(BUILD_DIR)/%.o: $(SRC_DIR)/%.c | $(BUILD_DIR)
	@echo "Compiling $<..."
	@$(CC) $(CFLAGS) $(INCLUDES) -c $< -o $@

$(BUILD_DIR)/test_%.o: $(TEST_DIR)/%.c | $(BUILD_DIR)
	@echo "Compiling test $<..."
	@$(CC) $(CFLAGS) $(INCLUDES) -c $< -o $@

$(BUILD_DIR)/$(PROJECT): $(OBJS)
	@echo "Linking..."
	@$(CC) $(CFLAGS) $(OBJS) -o $@ $(LDFLAGS)
	@echo "✓ Build complete!"

test: CFLAGS += -DTEST_MODE
test: $(OBJS) $(TEST_OBJS)
	@echo "Building test suite..."
	@$(CC) $(CFLAGS) $(INCLUDES) $(OBJS) $(TEST_OBJS) -o $(BUILD_DIR)/test_suite $(LDFLAGS)
	@echo "✓ Test suite built!"
	@echo ""
	@echo "Running tests..."
	@./$(BUILD_DIR)/test_suite

clean:
	@echo "Cleaning..."
	@rm -rf $(BUILD_DIR)
	@echo "✓ Clean complete!"

help:
	@echo "Available targets:"
	@echo "  all   - Build the project"
	@echo "  test  - Build and run tests"
	@echo "  clean - Remove build files"
	@echo ""
	@echo "Options:"
	@echo "  PLATFORM=SIMULATOR (default)"
	@echo "  PLATFORM=STM32F4"
EOF