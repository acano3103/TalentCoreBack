import { Module } from '@nestjs/common';
import { NfcService } from './nfc.service';
import { NfcController } from './nfc.controller';

@Module({
  controllers: [NfcController],
  providers: [NfcService],
})
export class NfcModule {}
