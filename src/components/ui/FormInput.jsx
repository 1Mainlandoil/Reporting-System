const FormInput = ({ label, ...props }) => {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <input
        {...props}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-[#a9cd39]/50 focus:outline-none focus:ring-1 focus:ring-[#a9cd39]/20"
      />
    </label>
  )
}

export default FormInput
