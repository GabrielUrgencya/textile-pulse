"use client";

import * as React from "react";
import { Dice5 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showToast } from "@/lib/toast";

const ROLES = [
  { value: "ADMIN", label: "Administrador" },
  { value: "GERENTE", label: "Gerente" },
  { value: "COORDENADOR", label: "Coordenador" },
  { value: "OPERADOR", label: "Operador" },
  { value: "VENDEDOR", label: "Vendedor (LISION Vendas)" },
];

const SECTORS = [
  { value: "CORTE", label: "Corte" },
  { value: "COSTURA", label: "Costura" },
  { value: "ACABAMENTO", label: "Acabamento" },
  { value: "QUALIDADE", label: "Qualidade" },
  { value: "EXPEDICAO", label: "Expedição" },
  { value: "ADMINISTRATIVO", label: "Administrativo" },
  { value: "VENDAS", label: "Vendas" },
];

interface MemberFormData {
  id?: string;
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  sector?: string | null;
}

interface MemberFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: MemberFormData | null;
  onSuccess: () => void;
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  sector?: string;
  pin?: string;
}

function MemberForm({ open, onOpenChange, member, onSuccess }: MemberFormProps) {
  const isEdit = !!member?.id;

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [role, setRole] = React.useState("");
  const [sector, setSector] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [loading, setLoading] = React.useState(false);
  const [createdPin, setCreatedPin] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      if (member) {
        setName(member.full_name || "");
        setEmail(member.email || "");
        setPhone(member.phone || "");
        setRole(member.role || "");
        setSector(member.sector || "");
      } else {
        setName("");
        setEmail("");
        setPhone("");
        setRole("");
        setSector("");
        setPassword("");
      }
      setPin("");
      setErrors({});
      setCreatedPin(null);
    }
  }, [open, member]);

  const needsPassword = !isEdit && role !== "OPERADOR";

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!name.trim()) newErrors.name = "Nome é obrigatório";
    if (!role) newErrors.role = "Cargo é obrigatório";
    if (!sector) newErrors.sector = "Setor é obrigatório";
    if (!isEdit && role !== "OPERADOR" && !email.trim()) {
      newErrors.email = "Email é obrigatório para este cargo";
    }
    if (needsPassword && !password) {
      newErrors.password = "Senha é obrigatória para este cargo";
    } else if (password && password.length < 6) {
      newErrors.password = "Senha deve ter no mínimo 6 caracteres";
    }
    if (pin && (pin.length !== 6 || !/^\d+$/.test(pin))) {
      newErrors.pin = "PIN deve ter exatamente 6 dígitos numéricos";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const generatePin = () => {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const generated = String(100000 + (array[0] % 900000));
    setPin(generated);
    setErrors((prev) => ({ ...prev, pin: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      if (isEdit) {
        const res = await fetch(`/api/team/members/${member!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim() || null,
            role,
            sector,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Erro ao atualizar membro");
        }
        showToast("success", "Membro atualizado");
        onOpenChange(false);
        onSuccess();
      } else {
        const body: Record<string, unknown> = {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          role,
          sector,
        };
        if (password) body.password = password;
        if (pin) body.pin = pin;

        const res = await fetch("/api/team/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const resBody = await res.json().catch(() => ({}));
          throw new Error(resBody.error || "Erro ao criar membro");
        }
        const json = await res.json();
        if (json.data?.pin) {
          setCreatedPin(json.data.pin);
          showToast("success", "Membro criado");
        } else {
          showToast("success", "Membro criado");
          onOpenChange(false);
          onSuccess();
        }
      }
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseAfterPin = () => {
    setCreatedPin(null);
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar Membro" : "Novo Membro"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Atualize as informações do membro da equipe." : "Preencha os dados para cadastrar um novo membro."}
          </SheetDescription>
        </SheetHeader>

        {createdPin ? (
          <div className="mt-8 space-y-6 text-center">
            <p className="text-sm text-muted-foreground">
              Membro criado. Anote o PIN e entregue ao operador:
            </p>
            <div className="font-mono text-4xl font-bold tracking-[0.3em] text-foreground py-4">
              {createdPin}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(createdPin);
                showToast("success", "PIN copiado");
              }}
            >
              Copiar PIN
            </Button>
            <Button onClick={handleCloseAfterPin} className="w-full">
              Fechar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="member-name">Nome *</Label>
              <Input
                id="member-name"
                className="input-field"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
                }}
                placeholder="Nome completo"
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="member-email">
                Email {role !== "OPERADOR" ? "*" : "(opcional)"}
              </Label>
              <Input
                id="member-email"
                type="email"
                className="input-field"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                }}
                placeholder="email@exemplo.com"
                disabled={isEdit}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
              {isEdit && (
                <p className="text-xs text-muted-foreground">
                  Email não pode ser alterado após criação
                </p>
              )}
            </div>

            {/* Senha (somente criação) */}
            {!isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="member-password">
                  Senha {needsPassword ? "*" : "(opcional)"}
                </Label>
                <Input
                  id="member-password"
                  type="password"
                  className="input-field"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                  }}
                  placeholder="Mínimo 6 caracteres"
                />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password}</p>
                )}
                {role === "OPERADOR" && (
                  <p className="text-xs text-muted-foreground">
                    Operadores usam PIN para acessar. Senha é opcional.
                  </p>
                )}
              </div>
            )}

            {/* Telefone */}
            <div className="space-y-1.5">
              <Label htmlFor="member-phone">Telefone</Label>
              <Input
                id="member-phone"
                className="input-field"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label>Cargo *</Label>
              <Select
                value={role}
                onValueChange={(v) => {
                  setRole(v);
                  if (errors.role) setErrors((p) => ({ ...p, role: undefined }));
                  // Vendedor já cai no setor Vendas por padrão (segue editável).
                  if (v === "VENDEDOR" && !sector) {
                    setSector("VENDAS");
                    setErrors((p) => ({ ...p, sector: undefined }));
                  }
                }}
              >
                <SelectTrigger className="input-field">
                  <SelectValue placeholder="Selecione o cargo" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.role && (
                <p className="text-xs text-destructive">{errors.role}</p>
              )}
              {role === "VENDEDOR" && (
                <p className="text-xs text-muted-foreground">
                  Acessa somente o módulo LISION Vendas — sem acesso às áreas de produção.
                  Recebe vínculo de vendedora automaticamente.
                </p>
              )}
            </div>

            {/* Setor */}
            <div className="space-y-1.5">
              <Label>Setor *</Label>
              <Select
                value={sector}
                onValueChange={(v) => {
                  setSector(v);
                  if (errors.sector) setErrors((p) => ({ ...p, sector: undefined }));
                }}
              >
                <SelectTrigger className="input-field">
                  <SelectValue placeholder="Selecione o setor" />
                </SelectTrigger>
                <SelectContent>
                  {SECTORS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.sector && (
                <p className="text-xs text-destructive">{errors.sector}</p>
              )}
            </div>

            {/* PIN (somente criação) */}
            {!isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="member-pin">PIN (6 dígitos)</Label>
                <div className="flex gap-2">
                  <Input
                    id="member-pin"
                    className="input-field font-mono tracking-widest"
                    value={pin}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setPin(v);
                      if (errors.pin) setErrors((p) => ({ ...p, pin: undefined }));
                    }}
                    placeholder="000000"
                    maxLength={6}
                    inputMode="numeric"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={generatePin}
                    title="Gerar PIN aleatório"
                  >
                    <Dice5 className="size-4" />
                  </Button>
                </div>
                {errors.pin && (
                  <p className="text-xs text-destructive">{errors.pin}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Se não informado, um PIN será gerado automaticamente
                </p>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading
                ? "Salvando..."
                : isEdit
                  ? "Salvar"
                  : "Criar Membro"}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

export { MemberForm };
