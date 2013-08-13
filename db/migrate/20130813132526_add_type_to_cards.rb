class AddTypeToCards < ActiveRecord::Migration
  def change
    add_column :cards, :action_type, :string
    remove_column :cards, :shot, :boolean
  end
end
