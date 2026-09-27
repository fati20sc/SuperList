# ======================================================================
# tools/leer-token-supabase.ps1
#
# Lee el Personal Access Token que el CLI de Supabase guarda en el almacen
# de credenciales de Windows, y lo imprime.
#
# POR QUE EXISTE: desde la version 2, "supabase login" ya no escribe el token
# en ~/.supabase/access-token, lo guarda en el Credential Manager. Por eso el
# archivo no aparece y hay que leerlo de ahi. Asi el token se puede usar sin
# pedirlo que se copie y pegue a mano, que es donde se pierde o se censura.
#
# Uso:  powershell -File tools\leer-token-supabase.ps1
# ======================================================================

$ErrorActionPreference = 'Stop'

$target = 'Supabase CLI:supabase'

$code = @"
using System;
using System.Runtime.InteropServices;

public class CredReader {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags;
        public int Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public long LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, int type, int flags, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr credentialPtr);
}
"@

Add-Type -TypeDefinition $code -Language CSharp

$ptr = [IntPtr]::Zero
# CRED_TYPE_GENERIC = 1
if (-not [CredReader]::CredRead($target, 1, 0, [ref]$ptr)) {
    Write-Error "No se encontro la credencial '$target'. Corré 'npx supabase login' primero."
    exit 1
}

try {
    $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][CredReader+CREDENTIAL])
    $bytes = New-Object byte[] $cred.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)

    # OJO: el Credential Manager guarda el blob en UTF-8, no en UTF-16. Leerlo
    # como Unicode parte los caracteres y sale basura.
    $token = [System.Text.Encoding]::UTF8.GetString($bytes).TrimEnd([char]0).Trim()

    if (-not $token) {
        Write-Error "La credencial existe pero esta vacia. Volve a autorizar."
        exit 1
    }

    # Se imprime en stdout para que otro proceso lo tome sin que quede en disco.
    Write-Output $token
}
finally {
    [CredReader]::CredFree($ptr)
}
