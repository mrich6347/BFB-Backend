import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AppService } from "./app.service";
import { SupabaseAuthGuard } from "./guards/auth.guard";

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
  ) { }

  @Get()
  @UseGuards(SupabaseAuthGuard)
  getPublicRoute() {
    return {
      message: this.appService.getHello()
    };
  }
}
