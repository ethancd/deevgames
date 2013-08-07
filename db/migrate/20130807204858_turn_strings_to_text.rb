class TurnStringsToText < ActiveRecord::Migration
  def up
    change_column :rules, :text, :text
    change_column :posts, :body, :text
    change_column :feedbacks, :body, :text
    change_column :comments, :body, :text
  end

  def down
    change_column :rules, :text, :string
    change_column :posts, :body, :string
    change_column :feedbacks, :body, :string
    change_column :comments, :body, :string
  end
end
