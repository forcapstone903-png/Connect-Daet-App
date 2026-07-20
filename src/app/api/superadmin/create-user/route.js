import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { registerStoredUser } from '@/lib/authStorage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const { full_name, email, password, user_type = 'admin' } = body || {};

    if (!email || !password) {
      return NextResponse.json({ success: false, message: 'Email and password are required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      const created = registerStoredUser({ full_name, email: email.toLowerCase().trim(), password, user_type: user_type || 'admin' });
      if (!created.success) {
        return NextResponse.json({ success: false, message: created.message || 'Unable to create account' }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: 'Privileged account created locally.', user: created.user });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: {
        data: {
          full_name: full_name || '',
          user_type: user_type || 'admin',
        },
      },
    });

    if (authError) {
      const created = registerStoredUser({ full_name, email: email.toLowerCase().trim(), password, user_type: user_type || 'admin' });
      if (!created.success) {
        return NextResponse.json({ success: false, message: authError.message || 'Unable to create account' }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: 'Privileged account created locally after auth issue.', user: created.user });
    }

    const profilePayload = {
      id: authData?.user?.id,
      email: authData?.user?.email,
      full_name: full_name || '',
      user_type: user_type || 'admin',
      points: 0,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (authData?.user?.id) {
      await supabase.from('info_users').upsert(profilePayload, { onConflict: 'id' });
    }

    return NextResponse.json({
      success: true,
      message: 'Privileged account created successfully. Please confirm the email before sign-in.',
      user: {
        id: authData?.user?.id,
        email: authData?.user?.email,
        full_name: full_name || '',
        user_type: user_type || 'admin',
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
  }
}
