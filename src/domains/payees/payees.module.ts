import { Module } from '@nestjs/common';
import { PayeesService } from './payees.service';
import { PayeesController } from './payees.controller';
import { AuthModule } from '../../configurations/auth/auth.module';
import { SupabaseModule } from '../../supabase/supabase.module';

@Module({
  controllers: [PayeesController],
  providers: [PayeesService],
  exports: [PayeesService],
  imports: [AuthModule, SupabaseModule],
})
export class PayeesModule {}

