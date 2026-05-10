const FormInput = ({ label, ...props }) => {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
      />
    </label>
  )
}

export default FormInput
