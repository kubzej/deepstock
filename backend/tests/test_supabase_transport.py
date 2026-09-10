def test_postgrest_uses_shared_http11_client():
    import app.core.supabase as supabase_module

    session = supabase_module.supabase.postgrest.session

    assert session is supabase_module._http_client
    assert session._transport._pool._http2 is False
