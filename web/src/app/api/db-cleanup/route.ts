import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Signal from '@/models/Signal';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await dbConnect();
        // Delete all active/pending signals to clear the dashboard
        const result = await Signal.deleteMany({ 
            status: { $in: ['PENDING', 'ACTIVE', 'Pending', 'Active', 'active', 'pending'] } 
        });

        return NextResponse.json({ 
            success: true, 
            message: "Database Nuked successfully.", 
            deletedCount: result.deletedCount 
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
