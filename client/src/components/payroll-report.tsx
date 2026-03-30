import { useEffect, useState } from "react";
import { api } from "@/utils/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LeaveTypeBalance {
  leaveTypeName: string;
  leaveTypeId: string;
  balance: number;
  accrualRate: number;
  cycleStartDate: string;
}

interface EmployeeReport {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  leaveTypes: LeaveTypeBalance[];
  totalBalance: number;
}

function PayrollReport() {
  const [report, setReport] = useState<EmployeeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailTo, setEmailTo] = useState("");
  const [sending, setSending] = useState(false);
  const [runningAccrual, setRunningAccrual] = useState(false);

  async function fetchReport() {
    try {
      setLoading(true);
      const res = await api.get("/accrual/payroll-report");
      setReport(res.data.data);
    } catch (err) {
      console.error(err);
      toast("Error", {
        description: "Failed to load payroll report",
        style: { backgroundColor: "white", color: "black" },
        richColors: true,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailTo.trim()) return;
    try {
      setSending(true);
      await api.post("/accrual/send-payroll-report", { email: emailTo });
      toast("Success", {
        description: `Payroll report sent to ${emailTo}`,
        style: { backgroundColor: "white", color: "black" },
        richColors: true,
      });
    } catch (err) {
      console.error(err);
      toast("Error", {
        description: "Failed to send report email",
        style: { backgroundColor: "white", color: "black" },
        richColors: true,
      });
    } finally {
      setSending(false);
    }
  }

  async function handleRunAccrual() {
    try {
      setRunningAccrual(true);
      const res = await api.post("/accrual/run", {});
      const data = res.data.data;
      toast("Accrual Complete", {
        description: `${data.processed} processed, ${data.skipped} skipped`,
        style: { backgroundColor: "white", color: "black" },
        richColors: true,
      });
      fetchReport();
    } catch (err) {
      console.error(err);
      toast("Error", {
        description: "Failed to run accrual",
        style: { backgroundColor: "white", color: "black" },
        richColors: true,
      });
    } finally {
      setRunningAccrual(false);
    }
  }

  useEffect(() => {
    fetchReport();
  }, []);

  const now = new Date();
  const monthName = now.toLocaleString("en-ZA", {
    month: "long",
    year: "numeric",
  });

  const totalLiability = report.reduce((sum, r) => sum + r.totalBalance, 0);

  return (
    <div className="w-full h-full p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Payroll Leave Report</h1>
          <p className="text-sm text-muted-foreground">{monthName}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRunAccrual}
            disabled={runningAccrual}
          >
            {runningAccrual ? "Running..." : "Run Monthly Accrual"}
          </Button>
          <Button variant="outline" onClick={fetchReport}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Financial Liability Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Total Leave Liability</CardTitle>
          <CardDescription>
            Total leave days owed across all employees
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">
            {Math.round(totalLiability * 100) / 100} days
          </p>
        </CardContent>
      </Card>

      {/* Email Report */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Email Report</CardTitle>
          <CardDescription>
            Send this month's payroll report to the payroll company
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSendEmail} className="flex gap-2 items-end">
            <div className="flex-1">
              <Label htmlFor="payrollEmail">Email address</Label>
              <Input
                id="payrollEmail"
                type="email"
                placeholder="payroll@company.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={sending || !emailTo.trim()}>
              {sending ? "Sending..." : "Send Report"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Employee Table */}
      {loading ? (
        <p className="text-muted-foreground">Loading report...</p>
      ) : (
        <div className="rounded-md border overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Employee</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Leave Balances</th>
                <th className="text-left p-3 font-medium">Accrual Rate</th>
                <th className="text-right p-3 font-medium">Total Days Owed</th>
              </tr>
            </thead>
            <tbody>
              {report.map((employee) => (
                <tr key={employee.userId} className="border-b">
                  <td className="p-3 font-medium">{employee.fullName}</td>
                  <td className="p-3 text-muted-foreground">
                    {employee.email}
                  </td>
                  <td className="p-3">
                    {employee.leaveTypes.length === 0 ? (
                      <span className="text-muted-foreground">
                        No leave assigned
                      </span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {employee.leaveTypes.map((lt) => (
                          <span key={lt.leaveTypeId}>
                            {lt.leaveTypeName}:{" "}
                            <strong>
                              {Math.round(lt.balance * 100) / 100}
                            </strong>{" "}
                            days
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {employee.leaveTypes.length === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {employee.leaveTypes.map((lt) => (
                          <span key={lt.leaveTypeId}>
                            {lt.accrualRate} days/mo
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {employee.totalBalance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default PayrollReport;
