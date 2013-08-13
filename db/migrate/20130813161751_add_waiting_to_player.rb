class AddWaitingToPlayer < ActiveRecord::Migration
  def change
    add_column :players, :ready, :boolean
  end
end
