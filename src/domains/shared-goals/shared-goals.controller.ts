import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe
} from '@nestjs/common';
import { SharedGoalsService } from './shared-goals.service';
import { SharedGoalsCollaborationService } from './shared-goals-collaboration.service';
import {
  CreateSharedGoalDto,
  UpdateSharedGoalDto,
  SharedGoalResponse,
  CreateInvitationDto,
  InvitationResponse,
  GoalParticipantResponse,
  UpdateParticipantDto,
  UpdateParticipantByCreatorDto,
  GoalProgressResponse
} from './dto/shared-goal.dto';
import { SupabaseAuthGuard } from '../../guards/auth.guard';
import { AuthService } from '../../configurations/auth/auth.service';

@Controller('shared-goals')
@UseGuards(SupabaseAuthGuard)
export class SharedGoalsController {
  constructor(
    private readonly sharedGoalsService: SharedGoalsService,
    private readonly sharedGoalsCollaborationService: SharedGoalsCollaborationService,
    private readonly authService: AuthService
  ) {}

  @Post()
  async create(@Body() createSharedGoalDto: CreateSharedGoalDto, @Req() req: any): Promise<SharedGoalResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsService.create(createSharedGoalDto, req.user.id, authToken);
  }

  @Get()
  async findAll(@Query('budgetId') budgetId: string, @Req() req: any): Promise<SharedGoalResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsService.findByUserId(req.user.id, budgetId, authToken);
  }

  // ===== INVITATION ENDPOINTS =====
  // Note: These must come before the :id routes to avoid route conflicts

  @Get('invitations')
  async getInvitations(@Req() req: any): Promise<InvitationResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsCollaborationService.getInvitations(req.user.id, authToken);
  }

  @Post('invitations/:invitationId/accept')
  async acceptInvitation(
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
    @Req() req: any
  ): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsCollaborationService.acceptInvitation(invitationId, req.user.id, authToken);
  }

  @Post('invitations/:invitationId/decline')
  async declineInvitation(
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
    @Req() req: any
  ): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsCollaborationService.declineInvitation(invitationId, req.user.id, authToken);
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

  @Post(':id/invite')
  async inviteUser(
    @Param('id', new ParseUUIDPipe()) goalId: string,
    @Body() createInvitationDto: CreateInvitationDto,
    @Req() req: any
  ): Promise<InvitationResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsCollaborationService.inviteUser(goalId, createInvitationDto, req.user.id, authToken);
  }

  // ===== PARTICIPANT ENDPOINTS =====

  @Get(':id/participants')
  async getParticipants(
    @Param('id', new ParseUUIDPipe()) goalId: string,
    @Req() req: any
  ): Promise<GoalParticipantResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsCollaborationService.getGoalParticipants(goalId, req.user.id, authToken);
  }

  @Post(':id/leave')
  async leaveGoal(
    @Param('id', new ParseUUIDPipe()) goalId: string,
    @Req() req: any
  ): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsCollaborationService.leaveGoal(goalId, req.user.id, authToken);
  }

  @Put(':id/participant')
  async updateParticipant(
    @Param('id', new ParseUUIDPipe()) goalId: string,
    @Body() updateParticipantDto: UpdateParticipantDto,
    @Req() req: any
  ): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsCollaborationService.updateParticipant(goalId, updateParticipantDto, req.user.id, authToken);
  }

  @Put(':id/participant/:participantId/by-creator')
  async updateParticipantByCreator(
    @Param('id', new ParseUUIDPipe()) goalId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
    @Body() updateParticipantByCreatorDto: UpdateParticipantByCreatorDto,
    @Req() req: any
  ): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsCollaborationService.updateParticipantByCreator(goalId, participantId, updateParticipantByCreatorDto, req.user.id, authToken);
  }

  @Delete(':id/participant/:participantId')
  async removeParticipant(
    @Param('id', new ParseUUIDPipe()) goalId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
    @Req() req: any
  ): Promise<void> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsCollaborationService.removeParticipant(goalId, participantId, req.user.id, authToken);
  }

  // ===== PROGRESS ENDPOINTS =====

  @Get(':id/progress')
  async getGoalProgress(
    @Param('id', new ParseUUIDPipe()) goalId: string,
    @Req() req: any
  ): Promise<GoalProgressResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.sharedGoalsService.getGoalProgress(goalId, req.user.id, authToken);
  }
}
