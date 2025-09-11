import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="rounded-2xl border bg-background p-4 sm:p-6">{children}</div>
    </section>
  );
}

export default function StyleguidePage() {
  const rows = [
    { code: "pump-001", name: "Bomba principal", type: "Centrífuga", location: "Planta A" },
    { code: "pump-002", name: "Bomba auxiliar", type: "Helicoidal", location: "Planta B" },
    { code: "motor-001", name: "Motor 30kW", type: "Eléctrico", location: "Nave 2" },
  ];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Styleguide</h1>
        <p className="text-muted-foreground">
          Catálogo visual de componentes base para mantener coherencia.
        </p>
      </header>

      {/* Buttons */}
      <Section title="Buttons">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Variants</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button variant="destructive">Destructive</Button>
            </CardContent>
          </Card>
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Sizes</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Button size="sm">sm</Button>
              <Button size="default">md</Button>
              <Button size="lg">lg</Button>
            </CardContent>
            <CardFooter className="text-sm text-muted-foreground">
              Incluye estado <code>disabled</code> y <code>loading</code> si lo usas.
            </CardFooter>
          </Card>
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>States</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Button disabled>Disabled</Button>
              <Button variant="outline" disabled>
                Disabled
              </Button>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* Card */}
      <Section title="Card">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Resumen de Activo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p><strong>Código:</strong> pump-001</p>
            <p><strong>Nombre:</strong> Bomba principal</p>
            <p><strong>Ubicación:</strong> Planta A</p>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button size="sm">Editar</Button>
            <Button size="sm" variant="outline">Ver</Button>
          </CardFooter>
        </Card>
      </Section>

      {/* Inputs */}
      <Section title="Inputs">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" placeholder="Bomba principal" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Código</Label>
              <Input id="code" placeholder="pump-001" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <Input id="type" placeholder="Centrífuga" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" placeholder="Observaciones…" className="min-h-[140px]" />
          </div>
        </div>
      </Section>

      {/* Alerts */}
      <Section title="Alerts">
        <div className="grid gap-4 lg:grid-cols-2">
          <Alert>
            <AlertTitle>Información</AlertTitle>
            <AlertDescription>
              Esta es una alerta informativa básica.
            </AlertDescription>
          </Alert>
          <Alert className="border-destructive/50 text-destructive">
            <AlertTitle>Crítica</AlertTitle>
            <AlertDescription>
              Condición de temperatura excedida. Revise el equipo.
            </AlertDescription>
          </Alert>
        </div>
      </Section>

      {/* Badges */}
      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Section>

      {/* Table */}
      <Section title="Table">
        <div className="rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ubicación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.code}>
                  <TableCell className="font-medium">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.type}</TableCell>
                  <TableCell>{r.location}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}
