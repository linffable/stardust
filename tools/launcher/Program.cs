using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

static class Program
{
    const string Version = "1.0.1";
    static string LogPath;

    [STAThread]
    static void Main()
    {
        string baseDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Stardust");
        Directory.CreateDirectory(baseDir);
        LogPath = Path.Combine(baseDir, "launcher.log");

        try
        {
            Log("=== start v" + Version);
            string www = Path.Combine(baseDir, "www");
            string marker = Path.Combine(baseDir, "version.txt");

            bool needExtract = !File.Exists(marker) || File.ReadAllText(marker).Trim() != Version;
            if (needExtract)
            {
                Log("extract -> " + www);
                if (Directory.Exists(www)) Directory.Delete(www, true);
                Directory.CreateDirectory(www);
                Assembly asm = Assembly.GetExecutingAssembly();
                using (Stream s = asm.GetManifestResourceStream("www.zip"))
                using (ZipArchive zip = new ZipArchive(s, ZipArchiveMode.Read))
                {
                    foreach (ZipArchiveEntry entry in zip.Entries)
                    {
                        string target = Path.Combine(www, entry.FullName.Replace('/', '\\'));
                        if (entry.FullName.EndsWith("/"))
                        {
                            Directory.CreateDirectory(target);
                            continue;
                        }
                        Directory.CreateDirectory(Path.GetDirectoryName(target));
                        using (Stream src = entry.Open())
                        using (FileStream dst = File.Create(target))
                        {
                            src.CopyTo(dst);
                        }
                    }
                }
                File.WriteAllText(marker, Version);
                Log("extract ok");
            }
            else
            {
                Log("payload already extracted");
            }

            string page = Path.Combine(www, "index.html");
            string url = new Uri(page).AbsoluteUri;
            string profile = Path.Combine(baseDir, "profile");

            string edge = FindEdge();
            Log("edge=" + (edge ?? "NOT FOUND"));

            bool launched = false;
            if (edge != null)
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo(edge);
                    psi.Arguments =
                        "--app=\"" + url + "\" " +
                        "--window-size=1280,800 " +
                        "--user-data-dir=\"" + profile + "\" " +
                        "--no-first-run --no-default-browser-check";
                    psi.UseShellExecute = false;
                    Process p = Process.Start(psi);
                    Log("edge started pid=" + (p == null ? 0 : p.Id));
                    launched = true;
                }
                catch (Exception ex)
                {
                    Log("edge start failed: " + ex.Message);
                }
            }

            if (!launched)
            {
                Log("fallback: default browser");
                ProcessStartInfo psi2 = new ProcessStartInfo(url);
                psi2.UseShellExecute = true;
                Process.Start(psi2);
                Log("fallback started");
            }
        }
        catch (Exception ex)
        {
            Log("FATAL: " + ex);
            MessageBox.Show(
                "启动失败：\n\n" + ex.Message + "\n\n日志：" + LogPath,
                "碎星 · Stardust", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    static void Log(string msg)
    {
        try
        {
            File.AppendAllText(LogPath,
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + msg + Environment.NewLine);
        }
        catch { }
    }

    static string FindEdge()
    {
        string[] candidates = new string[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                @"Microsoft\Edge\Application\msedge.exe")
        };
        foreach (string p in candidates)
        {
            if (File.Exists(p)) return p;
        }
        return null;
    }
}
