import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, UnauthorizedException, ParseUUIDPipe, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BudgetsService } from './budgets.service';
import { BudgetResponse, CreateBudgetDto, UpdateBudgetDto } from './DTO/budget.dto';
import { SupabaseAuthGuard } from '../../guards/auth.guard';
import { AuthService } from '../../configurations/auth/auth.service';
import { YnabImportOrchestratorService } from '../../services/ynab-import/ynabImportOrchestratorService';
import { YnabImportResult, YnabImportRequest } from '../../services/ynab-import/ynabImportOrchestratorService';
import { diskStorage } from 'multer';
import { extname } from 'path';


@Controller('budgets')
@UseGuards(SupabaseAuthGuard)
export class BudgetsController {
  constructor(
    private readonly budgetsService: BudgetsService,
    private readonly authService: AuthService,
    private readonly ynabImportOrchestratorService: YnabImportOrchestratorService
  ) {}

  @Post()
  async create(@Body() createBudgetDto: CreateBudgetDto, @Req() req: any): Promise<BudgetResponse> {
    const authToken = this.authService.getAuthToken(req);
    return this.budgetsService.create(createBudgetDto, req.user.id, authToken);
  }

  @Get()
  async findAll(@Req() req: any): Promise<BudgetResponse[]> {
    const authToken = this.authService.getAuthToken(req);
    return this.budgetsService.findAll(req.user.id, authToken);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    const authToken = this.authService.getAuthToken(req);
    return this.budgetsService.findOne(id, req.user.id, authToken);
  }

  @Patch(':id')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() updateBudgetDto: UpdateBudgetDto, @Req() req: any) {
    const authToken = this.authService.getAuthToken(req);
    return this.budgetsService.update(id, updateBudgetDto, req.user.id, authToken);
  }

  @Post('import-ynab')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads/temp',
      filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `ynab-import-${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      // Only allow zip files
      if (file.mimetype === 'application/zip' || file.originalname.toLowerCase().endsWith('.zip')) {
        cb(null, true);
      } else {
        cb(new Error('Only ZIP files are allowed'), false);
      }
    },
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit
    },
  }))
  async importFromYnab(
    @UploadedFile() file: Express.Multer.File,
    @Body() importRequest: YnabImportRequest,
    @Req() req: any
  ): Promise<YnabImportResult> {
    if (!file) {
      return {
        success: false,
        error: 'No file uploaded',
        details: 'Please select a YNAB export zip file'
      };
    }

    const authToken = this.authService.getAuthToken(req);

    return this.ynabImportOrchestratorService.importFromZip(
      file.path,
      importRequest,
      req.user.id,
      authToken
    );
  }
}
