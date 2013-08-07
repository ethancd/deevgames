class CreateRules < ActiveRecord::Migration
  def change
    create_table :rules do |t|
      t.string :title
      t.string :text
      t.string :game

      t.timestamps
    end
  end
end
