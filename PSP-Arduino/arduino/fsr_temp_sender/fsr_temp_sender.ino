// fsr_temp_sender.ino - 8 FSRs + 2 temps + volume CSV @ 115200, 1 Hz
// Output: fsr1,fsr2,fsr3,fsr4,fsr5,fsr6,fsr7,fsr8,t1_c,t2_c,volume

const int fsrPins[8] = {A0,A1,A2,A3,A4,A5,A6,A7}; // adjust to your wiring
unsigned long lastMs = 0;

int to100(int raw){
  if (raw <= 100) return constrain(raw, 0, 100);
  long v = (long)raw * 100L / 1023L;
  if (v<0) v=0; if (v>100) v=100;
  return (int)v;
}

void setup(){
  Serial.begin(115200);
  while (!Serial) { ; }
}

void loop(){
  unsigned long now = millis();
  if (now - lastMs < 1000) return; // 1 Hz
  lastMs = now;

  int fsr[8];
  for (int i=0;i<8;i++){
    int raw = analogRead(fsrPins[i]);
    fsr[i] = to100(raw);
  }
  float t1 = 25.0 + (analogRead(A8)%50)/10.0; // placeholder temp reads
  float t2 = 25.5 + (analogRead(A9)%50)/10.0;
  int volume = 0;
  for (int i=0;i<8;i++) volume += fsr[i];
  volume = volume / 8; // average 0..100

  Serial.print(fsr[0]); for (int i=1;i<8;i++){ Serial.print(","); Serial.print(fsr[i]); }
  Serial.print(","); Serial.print(t1,1);
  Serial.print(","); Serial.print(t2,1);
  Serial.print(","); Serial.println(volume);
}
