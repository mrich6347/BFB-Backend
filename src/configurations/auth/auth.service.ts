import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthService {
    getAuthToken(req: any) {
        const authToken = req.headers.authorization?.split(' ')[1];
        if (!authToken) {
            throw new UnauthorizedException('No authorization token provided');
        }
        return authToken;
    }
}
