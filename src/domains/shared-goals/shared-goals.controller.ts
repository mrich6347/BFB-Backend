import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Put, 
  Param, 
  Delete,
  UseGuards, 
  Req, 
  ParseUUIDPipe 
} from '@nestjs/common';
import { SharedGoalsService } from './shared-goals.service';
import { 
  CreateSharedGoalDto, 
  UpdateSharedGoalDto, 
  SharedGoalResponse 
} from './dto/shared-goal.dto';
import { SupabaseAuthGuard } from '../../guards/auth.guard';
import { AuthService } from '../../configurations/auth/auth.service';

@Controller('shared-goals')
@UseGuards(SupabaseAuthGuard)
export class SharedGoalsController {
  constructor(
    private readonly sharedGoalsService: SharedGoalsService,
    private readonly authService: AuthService
  ) {}

  @Post()
  async create(@Body() createSharedGoalDto: CreateSharedGoalDto, @Req() req: any): Promise<SharedGoalResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsService.create(createSharedGoalDto, req.user.id, authToken);
  }

  @Get()
  async findAll(@Req() req: any): Promise<SharedGoalResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsService.findByUserId(req.user.id, authToken);
  }

  @Get(':id')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any): Promise<SharedGoalResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsService.findById(id, req.user.id, authToken);
  }

  @Put(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string, 
    @Body() updateSharedGoalDto: UpdateSharedGoalDto, 
    @Req() req: any
  ): Promise<SharedGoalResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsService.update(id, updateSharedGoalDto, req.user.id, authToken);
  }

  @Delete(':id')
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsService.delete(id, req.user.id, authToken);
  }
}
